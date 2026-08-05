import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { detectPlatformFromUrl } from '@/lib/media-url'
import { getServerToday } from '@/lib/queries'
import { fetchViewsDetailed } from '@/lib/tikhub'

export type RefreshViewsScope = 'recent' | 'all' | 'zeros' | 'filtered'

export type RefreshFilters = {
  from?: string | null
  to?: string | null
  creatorId?: number | null
  projectId?: number | null
  platform?: Platform | null
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
}

type Row = {
  id: number
  platform: Platform
  url: string
  views: number
}

const DEFAULT_CHUNK = 25
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
    const platform =
      f.platform === 'instagram' || f.platform === 'tiktok' ? f.platform : null

    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      WHERE (${from}::date IS NULL OR video_date >= ${from}::date)
        AND (${to}::date IS NULL OR video_date <= ${to}::date)
        AND (${creatorId}::int IS NULL OR creator_id = ${creatorId})
        AND (${projectId}::int IS NULL OR project_id = ${projectId})
        AND (${platform}::text IS NULL OR platform = ${platform})
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else if (scope === 'zeros') {
    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      WHERE views = 0
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else if (scope === 'all') {
    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
    hasMore = nextOffset != null
  } else {
    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      WHERE video_date = ${today}::date OR video_date = ${yesterday}::date
      ORDER BY id ASC
    `) as Row[]
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  let platformsFixed = 0
  const failReasons: string[] = []
  const failureSamples: RefreshFailureSample[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const detected = detectPlatformFromUrl(row.url)
    const platform = detected ?? row.platform
    if (detected && detected !== row.platform) {
      await sql`
        UPDATE submissions SET platform = ${detected} WHERE id = ${row.id}
      `
      platformsFixed += 1
      row.platform = detected
    }

    const result = await fetchViewsDetailed(platform, row.url)
    if (!result.ok) {
      failed += 1
      failReasons.push(result.reason)
      if (failureSamples.length < 12) {
        failureSamples.push({
          id: row.id,
          url: row.url,
          reason: result.reason,
        })
      }
      await sql`
        UPDATE submissions
        SET views_error = ${result.reason.slice(0, 400)}
        WHERE id = ${row.id}
      `
      continue
    }

    const urlChanged = Boolean(
      result.resolvedUrl && result.resolvedUrl !== row.url,
    )
    const viewsChanged = result.views !== row.views

    if (urlChanged && result.resolvedUrl) {
      await sql`
        UPDATE submissions
        SET views = ${result.views},
            url = ${result.resolvedUrl},
            views_error = NULL
        WHERE id = ${row.id}
      `
      updated += 1
    } else if (viewsChanged) {
      await sql`
        UPDATE submissions
        SET views = ${result.views}, views_error = NULL
        WHERE id = ${row.id}
      `
      updated += 1
    } else {
      await sql`
        UPDATE submissions SET views_error = NULL WHERE id = ${row.id}
      `
      skipped += 1
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
  }
}

/** @deprecated Prefer refreshViews('recent') */
export async function refreshViewsForRecentDays(delayMs = 150) {
  return refreshViews('recent', { delayMs })
}
