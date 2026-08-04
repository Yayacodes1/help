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
}

type Row = {
  id: number
  platform: Platform
  url: string
  views: number
}

/**
 * Fetch view counts via DataLikers.
 * - recent: video_date is today or yesterday (cheap daily cron)
 * - all: every submission (admin backfill)
 * Only writes when a new count is returned — never clears existing views on failure.
 */
export async function refreshViews(
  scope: RefreshViewsScope = 'recent',
  delayMs = 150,
): Promise<RefreshViewsResult> {
  const today = await getServerToday()
  const yesterday = addDays(today, -1)

  const rows = (
    scope === 'all'
      ? await sql`
          SELECT id, platform, url, views
          FROM submissions
          ORDER BY video_date DESC, id DESC
        `
      : await sql`
          SELECT id, platform, url, views
          FROM submissions
          WHERE video_date = ${today}::date OR video_date = ${yesterday}::date
          ORDER BY id ASC
        `
  ) as Row[]

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
  }
}

/** @deprecated Prefer refreshViews('recent') */
export async function refreshViewsForRecentDays(delayMs = 150) {
  return refreshViews('recent', delayMs)
}
