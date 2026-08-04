import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import { fetchViewsForUrl } from '@/lib/datalikers'

export type RefreshViewsScope = 'recent' | 'all'

export type RefreshViewsResult = {
  scope: RefreshViewsScope
  today: string
  yesterday: string
  checked: number
  updated: number
  skipped: number
  failed: number
  /** Next offset for chunked `all` runs; null when finished. */
  nextOffset: number | null
}

type Row = {
  id: number
  platform: Platform
  url: string
  views: number
}

const DEFAULT_CHUNK = 30

/**
 * Fetch view counts via DataLikers.
 * - recent: today + yesterday (daily cron; one shot)
 * - all: every submission, oldest first, in chunks (admin backfill)
 * Only writes when a new count is returned — never clears existing views on failure.
 */
export async function refreshViews(
  scope: RefreshViewsScope = 'recent',
  options: { delayMs?: number; limit?: number; offset?: number } = {},
): Promise<RefreshViewsResult> {
  const delayMs = options.delayMs ?? 120
  const today = await getServerToday()
  const yesterday = addDays(today, -1)

  let rows: Row[]
  let nextOffset: number | null = null

  if (scope === 'all') {
    const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_CHUNK))
    const offset = Math.max(0, options.offset ?? 0)
    rows = (await sql`
      SELECT id, platform, url, views
      FROM submissions
      ORDER BY video_date ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[]
    nextOffset = rows.length < limit ? null : offset + rows.length
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }

    const views = await fetchViewsForUrl(row.platform, row.url)
    if (views == null) {
      failed += 1
      continue
    }
    if (views === row.views) {
      skipped += 1
      continue
    }
    await sql`UPDATE submissions SET views = ${views} WHERE id = ${row.id}`
    updated += 1
  }

  return {
    scope,
    today,
    yesterday,
    checked: rows.length,
    updated,
    skipped,
    failed,
    nextOffset,
  }
}

/** @deprecated Prefer refreshViews('recent') */
export async function refreshViewsForRecentDays(delayMs = 120) {
  return refreshViews('recent', { delayMs })
}
