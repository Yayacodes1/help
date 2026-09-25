import { addDays } from '@/lib/campaign'

/** Posting day used for reposter strikes. Midnight → midnight (Riyadh). */
export const OPERATIONAL_TZ = 'Asia/Riyadh'
export const OPERATIONAL_ROLLOVER_HOUR = 0
export const CORRECTIVE_STRIKE_COUNT = 3
export const STRIKE_LOOKBACK_DAYS = 3

/** Max strikes for a contract; falls back to CORRECTIVE_STRIKE_COUNT. */
export function strikeLimit(max: number | null | undefined): number {
  const n = Number(max)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : CORRECTIVE_STRIKE_COUNT
}

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((p) => p.type === type)?.value)
}

/** Calendar YYYY-MM-DD in `tz` for an instant. */
export function calendarDayInTimeZone(iso: string, tz: string): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = partNumber(parts, 'year')
  const month = partNumber(parts, 'month')
  const day = partNumber(parts, 'day')
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Operational posting day: the local calendar date in Riyadh.
 * With rollover hour 0, this is simply the Riyadh calendar day (midnight cutoff).
 */
export function operationalDayFromIso(
  iso: string,
  tz: string = OPERATIONAL_TZ,
  rolloverHour: number = OPERATIONAL_ROLLOVER_HOUR,
): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const year = partNumber(parts, 'year')
  const month = partNumber(parts, 'month')
  const day = partNumber(parts, 'day')
  const hour = partNumber(parts, 'hour')
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return hour < rolloverHour ? addDays(ymd, -1) : ymd
}

export function lastCompletedOperationalDay(today: string): string {
  return addDays(today, -1)
}
