import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import { fetchViewsForUrl } from '@/lib/datalikers'

export type RefreshViewsResult = {
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
 * Fetch view counts via DataLikers for submissions dated today or yesterday.
 * Only writes when a new count is returned — never clears existing views on failure.
 */
export async function refreshViewsForRecentDays(
  delayMs = 200,
): Promise<RefreshViewsResult> {
  const today = await getServerToday()
  const yesterday = addDays(today, -1)

  const rows = (await sql`
    SELECT id, platform, url, views
    FROM submissions
    WHERE video_date = ${today}::date OR video_date = ${yesterday}::date
    ORDER BY id ASC
  `) as Row[]

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
    today,
    yesterday,
    checked: rows.length,
    updated,
    skipped,
    failed,
  }
}
