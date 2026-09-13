import 'server-only'
import { sql } from '@/lib/db'
import { calendarDayInTimeZone, OPERATIONAL_TZ } from '@/lib/operational-day'
import type { FetchViewsOk } from '@/lib/tikhub'

/** Calendar day (YYYY-MM-DD) in Riyadh from a platform publish instant. */
export function videoDateFromPostedAt(postedAtIso: string): string {
  return calendarDayInTimeZone(postedAtIso, OPERATIONAL_TZ)
}

/** Persist views (+ optional platform publish time / resolved URL) after a TikHub hit. */
export async function applyFetchViewsResult(
  id: number,
  result: FetchViewsOk,
  options: { updateUrl?: boolean } = {},
) {
  const postedAt = result.postedAt ?? null
  const resolvedUrl =
    options.updateUrl && result.resolvedUrl ? result.resolvedUrl : null

  if (resolvedUrl && postedAt) {
    await sql`
      UPDATE submissions
      SET views = ${result.views},
          views_error = NULL,
          url = ${resolvedUrl},
          platform_posted_at = ${postedAt}::timestamptz
      WHERE id = ${id}
    `
    return
  }
  if (resolvedUrl) {
    await sql`
      UPDATE submissions
      SET views = ${result.views},
          views_error = NULL,
          url = ${resolvedUrl}
      WHERE id = ${id}
    `
    return
  }
  if (postedAt) {
    await sql`
      UPDATE submissions
      SET views = ${result.views},
          views_error = NULL,
          platform_posted_at = ${postedAt}::timestamptz
      WHERE id = ${id}
    `
    return
  }
  await sql`
    UPDATE submissions
    SET views = ${result.views}, views_error = NULL
    WHERE id = ${id}
  `
}
