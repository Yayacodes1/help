import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { detectPlatformFromUrl } from '@/lib/media-url'
import { getServerToday } from '@/lib/queries'
import { fetchViewsDetailed } from '@/lib/tikhub'

export type RefreshViewsScope = 'recent' | 'all' | 'zeros'

export type RefreshViewsResult = {
  scope: RefreshViewsScope
  today: string
  yesterday: string
  checked: number
  updated: number
  skipped: number
  failed: number
  /** How many rows had platform rewritten from the URL in this chunk. */
  platformsFixed: number
  /** Next offset for chunked `all` scans; null when finished / not used for zeros. */
  nextOffset: number | null
  /** True when another zeros batch should be requested. */
  hasMore: boolean
  /** Top failure reasons in this chunk (for admin UI). */
  failures: { reason: string; count: number }[]
}

type Row = {
  id: number
  platform: Platform
  url: string
  views: number
}

const DEFAULT_CHUNK = 25

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
 * - recent: today + yesterday (daily cron)
 * - all: every submission, oldest first, offset chunks
 * - zeros: only rows still at 0 (no offset — each call picks remaining zeros)
 */
export async function refreshViews(
  scope: RefreshViewsScope = 'recent',
  options: { delayMs?: number; limit?: number; offset?: number } = {},
): Promise<RefreshViewsResult> {
  const delayMs = options.delayMs ?? 150
  const today = await getServerToday()
  const yesterday = addDays(today, -1)
  const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_CHUNK))
  const offset = Math.max(0, options.offset ?? 0)

  let rows: Row[]
  let nextOffset: number | null = null
  let hasMore = false

  if (scope === 'zeros') {
    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      WHERE views = 0
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit}
    `) as Row[]
    hasMore = rows.length >= limit
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }

    // Always trust the URL over the stored platform (heals old mislabeled submits).
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
      continue
    }

    const urlChanged = Boolean(
      result.resolvedUrl && result.resolvedUrl !== row.url,
    )
    const viewsChanged = result.views !== row.views
    if (!viewsChanged && !urlChanged) {
      skipped += 1
      continue
    }

    if (urlChanged && result.resolvedUrl) {
      await sql`
        UPDATE submissions
        SET views = ${result.views}, url = ${result.resolvedUrl}
        WHERE id = ${row.id}
      `
    } else {
      await sql`UPDATE submissions SET views = ${result.views} WHERE id = ${row.id}`
    }
    updated += 1
  }

  // For zeros scope: if every row in the batch failed, stop looping
  // (otherwise we'd retry the same zeros forever).
  if (scope === 'zeros' && rows.length > 0 && updated === 0 && skipped === 0) {
    hasMore = false
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
  }
}

/** @deprecated Prefer refreshViews('recent') */
export async function refreshViewsForRecentDays(delayMs = 150) {
  return refreshViews('recent', { delayMs })
}
