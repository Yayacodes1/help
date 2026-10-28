import 'server-only'
import { sql } from '@/lib/db'
import { calendarDayInTimeZone, OPERATIONAL_TZ } from '@/lib/operational-day'
import type { FetchViewsOk } from '@/lib/tikhub'
import { videoKeyFromUrl } from '@/lib/video-key'

/** Calendar day (YYYY-MM-DD) in Riyadh from a platform publish instant. */
export function videoDateFromPostedAt(postedAtIso: string): string {
  return calendarDayInTimeZone(postedAtIso, OPERATIONAL_TZ)
}

function validViews(views: number): number | null {
  if (!Number.isFinite(views) || views < 0 || views > 1_000_000_000_000) return null
  return Math.floor(views)
}

/**
 * Persist views after a TikHub hit.
 * Never writes when `views` is invalid. Optional `fetchedAt` blocks a slower
 * response from overwriting a newer successful refresh.
 * Refresh-views does not rewrite URL, key, or posted time so the row stays put.
 */
export async function applyFetchViewsResult(
  id: number,
  result: FetchViewsOk,
  options: {
    updateUrl?: boolean
    updatePostedAt?: boolean
    fetchedAt?: string | null
  } = {},
): Promise<boolean> {
  const views = validViews(result.views)
  if (views == null) return false

  const postedAt = options.updatePostedAt ? result.postedAt ?? null : null
  const resolvedUrl =
    options.updateUrl && result.resolvedUrl ? result.resolvedUrl : null
  const resolvedKey = resolvedUrl ? videoKeyFromUrl(resolvedUrl) : null
  const fetchedAt = options.fetchedAt ?? null

  const saved = (await sql`
    UPDATE submissions
    SET views = ${views},
        views_error = NULL,
        views_fetched_at = NOW(),
        url = COALESCE(${resolvedUrl}, url),
        video_key = COALESCE(${resolvedKey}, video_key),
        platform_posted_at = COALESCE(${postedAt}::timestamptz, platform_posted_at)
    WHERE id = ${id}
      AND (
        ${fetchedAt}::timestamptz IS NULL
        OR views_fetched_at IS NULL
        OR views_fetched_at <= ${fetchedAt}::timestamptz
      )
    RETURNING id
  `) as { id: number }[]
  return saved.length > 0
}
