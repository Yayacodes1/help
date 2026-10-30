import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { detectPlatformFromUrl } from '@/lib/media-url'
import { getServerToday } from '@/lib/queries'
import { fetchViewsDetailed, type FetchViewsResult } from '@/lib/tikhub'
import { applyFetchViewsResult } from '@/lib/submission-meta'
import {
  backoffMs,
  classifyViewsError,
  isRetryableViewsCategory,
  publicViewsError,
  shouldPersistViewsError,
} from '@/lib/tikhub-errors'

export { isTransientViewsError } from '@/lib/tikhub-errors'

/** Fill view counts after a submit so TikHub never blocks saving the links. */
export async function hydrateSubmissionViews(
  rows: Array<{ id: number; platform: Platform; url: string }>,
) {
  for (const row of rows) {
    try {
      const result = await fetchViewsDetailed(row.platform, row.url)
      if (result.ok) {
        await applyFetchViewsResult(row.id, result, { updatePostedAt: true })
      } else if (shouldPersistViewsError(result.category)) {
        await sql`
          UPDATE submissions
          SET views_error = ${publicViewsError(result.reason, row.platform).slice(0, 400)}
          WHERE id = ${row.id}
        `
      }
    } catch (e) {
      const reason = publicViewsError(
        e instanceof Error ? e.message : 'views fetch failed',
        row.platform,
      )
      if (!shouldPersistViewsError(classifyViewsError(reason))) continue
      await sql`
        UPDATE submissions
        SET views_error = ${reason.slice(0, 400)}
        WHERE id = ${row.id}
      `.catch(() => undefined)
    }
  }
}

export type RefreshViewsScope = 'recent' | 'all' | 'zeros' | 'filtered'

export type RefreshFilters = {
  from?: string | null
  to?: string | null
  creatorId?: number | null
  projectId?: number | null
  role?: string | null
  platform?: Platform | null
  submissionId?: number | null
  /** Only these people's videos (a leader's team); null = everyone. */
  creatorIds?: number[] | null
  /** Videos section page (1-based). Used only if submissionIds is empty. */
  page?: number | null
  pageSize?: number | null
  /** Exact videos currently displayed. Bulk refresh uses this list only. */
  submissionIds?: number[] | null
  /** All videos matching the current filters, not only the displayed page. */
  allMatching?: boolean | null
  /** Every tracked video, including older ones, for daily view-gain snapshots. */
  catalog?: boolean | null
}

export type RefreshFailureSample = {
  id: number
  url: string
  reason: string
}

export type RefreshViewsResult = {
  scope: RefreshViewsScope
  today: string
  yesterday: string
  checked: number
  updated: number
  skipped: number
  failed: number
  platformsFixed: number
  nextOffset: number | null
  hasMore: boolean
  failures: { reason: string; count: number }[]
  failureSamples: RefreshFailureSample[]
  /** New play count when a single video was refreshed. */
  views?: number
}

type Row = {
  id: number
  platform: Platform
  url: string
  views: number
  platform_posted_at: string | null
}

const DEFAULT_CHUNK = 25
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type RefreshOneOutcome = 'updated' | 'skipped' | 'failed' | 'waiting'

export type RefreshOneResult = {
  outcome: RefreshOneOutcome
  reason?: string
  views?: number
  platformsFixed: number
  retryAfterMs?: number
}

type RefreshRow = {
  id: number
  platform: Platform
  url: string
  views: number
  platform_posted_at: string | null
}

export async function refreshOneSubmission(
  row: RefreshRow,
  options: { retryTransient?: boolean; preloaded?: FetchViewsResult | null } = {
    retryTransient: false,
  },
): Promise<RefreshOneResult> {
  const fetchedAt = new Date().toISOString()
  let platformsFixed = 0
  const detected = detectPlatformFromUrl(row.url)
  const platform = detected ?? row.platform
  if (detected && detected !== row.platform) {
    await sql`
      UPDATE submissions SET platform = ${detected} WHERE id = ${row.id}
    `
    platformsFixed = 1
    row.platform = detected
  }

  const attempt = async (
    preloaded?: FetchViewsResult | null,
  ): Promise<RefreshOneResult> => {
    const result = preloaded ?? (await fetchViewsDetailed(platform, row.url))
    if (!result.ok) {
      const reason = publicViewsError(result.reason, platform)
      if (shouldPersistViewsError(result.category)) {
        await sql`
          UPDATE submissions
          SET views_error = ${reason.slice(0, 400)}
          WHERE id = ${row.id}
        `
      } else {
        await sql`
          UPDATE submissions
          SET views_error = NULL
          WHERE id = ${row.id}
            AND views_error IS NOT NULL
        `.catch(() => undefined)
      }
      if (isRetryableViewsCategory(result.category)) {
        return {
          outcome: 'waiting',
          reason,
          platformsFixed,
          retryAfterMs: result.retryAfterMs ?? backoffMs(1),
        }
      }
      return { outcome: 'failed', reason, platformsFixed }
    }

    const viewsChanged = result.views !== row.views

    if (viewsChanged) {
      const saved = await applyFetchViewsResult(row.id, result, {
        fetchedAt,
      })
      if (!saved) {
        return { outcome: 'skipped', views: row.views, platformsFixed }
      }
      return { outcome: 'updated', views: result.views, platformsFixed }
    }

    await sql`
      UPDATE submissions
      SET views_error = NULL, views_fetched_at = NOW()
      WHERE id = ${row.id}
        AND (
          views_fetched_at IS NULL
          OR views_fetched_at <= ${fetchedAt}::timestamptz
        )
    `
    const { recordViewSnapshot } = await import('@/lib/daily-views-store')
    await recordViewSnapshot({
      submissionId: row.id,
      views: result.views,
      observedAt: fetchedAt,
    }).catch(() => undefined)
    return { outcome: 'skipped', views: result.views, platformsFixed }
  }

  const maxAttempts = options.retryTransient === true ? 5 : 1
  const deadline = Date.now() + 40_000
  let result = await attempt(options.preloaded)
  for (let i = 1; i < maxAttempts; i++) {
    const retryable =
      result.outcome === 'waiting' ||
      (result.outcome === 'failed' &&
        Boolean(result.reason) &&
        isRetryableViewsCategory(classifyViewsError(result.reason ?? '')))
    if (!retryable) break
    const wait = Math.min(2_000, Math.max(400, result.retryAfterMs ?? backoffMs(i)))
    if (Date.now() + wait >= deadline) break
    await new Promise((r) => setTimeout(r, wait))
    result = await attempt(null)
    result.platformsFixed = Math.max(result.platformsFixed, platformsFixed)
  }
  if (result.outcome === 'waiting' && options.retryTransient === true) {
    return { outcome: 'skipped', views: row.views, platformsFixed: result.platformsFixed }
  }
  return result
}

function tallyFailures(
  reasons: string[],
): { reason: string; count: number }[] {
  const map = new Map<string, number>()
  for (const r of reasons) map.set(r, (map.get(r) ?? 0) + 1)
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

/**
 * Fetch view counts via TikHub.
 * - recent: today + yesterday (cron)
 * - filtered: admin Refresh using Videos date/creator/platform filters
 * - all: every submission (legacy)
 * - zeros: only views = 0 (legacy)
 */
export async function refreshViews(
  scope: RefreshViewsScope = 'recent',
  options: {
    delayMs?: number
    limit?: number
    offset?: number
    filters?: RefreshFilters
  } = {},
): Promise<RefreshViewsResult> {
  const delayMs = options.delayMs ?? 150
  const today = await getServerToday()
  const yesterday = addDays(today, -1)
  const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_CHUNK))
  const offset = Math.max(0, options.offset ?? 0)

  let rows: Row[]
  let nextOffset: number | null = null
  let hasMore = false

  if (scope === 'filtered') {
    const f = options.filters ?? {}
    const from = f.from && DATE_RE.test(f.from) ? f.from : null
    const to = f.to && DATE_RE.test(f.to) ? f.to : null
    const creatorId = f.creatorId && Number.isFinite(f.creatorId) ? f.creatorId : null
    const projectId = f.projectId && Number.isFinite(f.projectId) ? f.projectId : null
    const submissionId =
      f.submissionId && Number.isFinite(f.submissionId) ? f.submissionId : null
    const role = f.role === 'creator' || f.role === 'reposter' ? f.role : null
    const platform =
      f.platform === 'instagram' || f.platform === 'tiktok' ? f.platform : null
    const ids = Array.isArray(f.creatorIds) ? f.creatorIds : null

    rows = (await sql`
      SELECT s.id, s.platform, s.url, s.views, s.platform_posted_at
      FROM submissions s
      JOIN creators c ON c.id = s.creator_id
      WHERE (${from}::date IS NULL OR s.video_date >= ${from}::date)
        AND (${to}::date IS NULL OR s.video_date <= ${to}::date)
        AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
        AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
        AND (${submissionId}::int IS NULL OR s.id = ${submissionId})
        AND (${role}::text IS NULL OR c.role = ${role})
        AND (${platform}::text IS NULL OR s.platform = ${platform})
        AND (${ids}::int[] IS NULL OR s.creator_id = ANY(${ids}::int[]))
      ORDER BY s.video_date ASC, s.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else if (scope === 'zeros') {
    rows = (await sql`
      SELECT id, platform, url, views, platform_posted_at
      FROM submissions
      WHERE views = 0
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else if (scope === 'all') {
    rows = (await sql`
      SELECT id, platform, url, views, platform_posted_at
      FROM submissions
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else {
    rows = (await sql`
      SELECT id, platform, url, views, platform_posted_at
      FROM submissions
      WHERE video_date = ${today}::date OR video_date = ${yesterday}::date
      ORDER BY id ASC
    `) as Row[]
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  let platformsFixed = 0
  let views: number | undefined
  const failReasons: string[] = []
  const failureSamples: RefreshFailureSample[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const single = Boolean(options.filters?.submissionId)
    const one = await refreshOneSubmission(row, { retryTransient: single })
    platformsFixed += one.platformsFixed
    if (one.views != null) views = one.views
    else if (one.outcome !== 'failed') views = row.views
    if (one.outcome === 'updated') updated += 1
    else if (one.outcome === 'skipped' || one.outcome === 'waiting') {
      skipped += 1
      if (views == null) views = row.views
    } else {
      failed += 1
      if (one.reason) failReasons.push(one.reason)
      if (one.reason && failureSamples.length < 12) {
        failureSamples.push({ id: row.id, url: row.url, reason: one.reason })
      }
      if (single) views = row.views
    }
  }

  return {
    scope,
    today,
    yesterday,
    checked: rows.length,
    updated,
    skipped,
    failed,
    platformsFixed,
    nextOffset,
    hasMore,
    failures: tallyFailures(failReasons),
    failureSamples,
    views,
  }
}

/** @deprecated Prefer refreshViews('recent') */
export async function refreshViewsForRecentDays(delayMs = 150) {
  return refreshViews('recent', { delayMs })
}
