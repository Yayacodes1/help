import { addDays, calendarMonthRange } from '@/lib/campaign'
import { eachDate } from '@/lib/consistency'

/** Real majority — not a weak 30% overlap. */
export const COMMISSION_MONTH_MAJORITY = 0.5

/** Inclusive day count between two YYYY-MM-DD dates. */
export function dayCountInclusive(start: string, end: string): number {
  if (!start || !end || start > end) return 0
  return eachDate(start, end).length
}

export function overlapInclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string; days: number } | null {
  const start = aStart > bStart ? aStart : bStart
  const end = aEnd < bEnd ? aEnd : bEnd
  if (start > end) return null
  return { start, end, days: dayCountInclusive(start, end) }
}

/**
 * Contract “belongs” to the selected window when ≥50% of its days fall inside.
 * Open-ended contracts are clipped to `today` for length.
 */
export function contractMajorityInWindow(opts: {
  contractStart: string
  contractEnd: string | null
  windowStart: string
  windowEnd: string
  today: string
  majority?: number
}): { ok: boolean; overlapDays: number; contractDays: number; share: number } {
  const majority = opts.majority ?? COMMISSION_MONTH_MAJORITY
  const end = opts.contractEnd && opts.contractEnd < opts.today ? opts.contractEnd : opts.today
  const start = opts.contractStart
  if (!start || start > end) {
    return { ok: false, overlapDays: 0, contractDays: 0, share: 0 }
  }
  const contractDays = dayCountInclusive(start, end)
  const overlap = overlapInclusive(start, end, opts.windowStart, opts.windowEnd)
  const overlapDays = overlap?.days ?? 0
  const share = contractDays > 0 ? overlapDays / contractDays : 0
  return {
    ok: share + 1e-9 >= majority,
    overlapDays,
    contractDays,
    share,
  }
}

/** Views window: from contract start (spillover before month) through selected `to`. */
export function commissionViewsRange(opts: {
  contractStart: string
  contractEnd: string | null
  windowTo: string
  today: string
}): { from: string; to: string } | null {
  const hardEnd =
    opts.contractEnd && opts.contractEnd < opts.windowTo
      ? opts.contractEnd
      : opts.windowTo < opts.today
        ? opts.windowTo
        : opts.today
  if (opts.contractStart > hardEnd) return null
  return { from: opts.contractStart, to: hardEnd }
}

export function resolveCommissionWindow(opts: {
  month?: string | null
  from?: string | null
  to?: string | null
  today: string
}): { month: string; from: string; to: string } {
  const today = opts.today
  const month =
    opts.month && /^\d{4}-\d{2}$/.test(opts.month) ? opts.month : today.slice(0, 7)
  const { start: monthStart, end: monthEndRaw } = calendarMonthRange(month)
  const monthEnd = monthEndRaw > today ? today : monthEndRaw
  const from =
    opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : monthStart
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : monthEnd
  const lo = from <= to ? from : to
  const hi = from <= to ? to : from
  return { month, from: lo, to: hi > today ? today : hi }
}

/** YYYY-MM list from earliest start through `today` (inclusive), oldest first. */
export function commissionMonthOptions(earliest: string | null, today: string): string[] {
  const startMonth = (earliest && /^\d{4}-\d{2}-\d{2}$/.test(earliest)
    ? earliest
    : today
  ).slice(0, 7)
  const endMonth = today.slice(0, 7)
  const out: string[] = []
  let cur = startMonth
  while (cur <= endMonth) {
    out.push(cur)
    const [y, m] = cur.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    cur = next
    if (out.length > 120) break
  }
  return out
}

/** Shift a YYYY-MM by one calendar month (for spillover helpers). */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export { addDays, calendarMonthRange }
