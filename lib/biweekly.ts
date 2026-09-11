import { addDays } from '@/lib/campaign'

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Inclusive day count between YYYY-MM-DD dates. */
export function daysBetweenInclusive(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

export type ContractPeriod = {
  startDate: string
  endDate: string | null
  baseAmount: number
}

/**
 * One biweekly pay from a contract's base.
 * A ~2-week contract stores the biweekly amount as base; a ~month contract stores
 * two waves, so biweekly is half. Open contracts follow the person's prior
 * 2-week history, otherwise base is treated as monthly.
 */
export function typicalBiweeklyAmount(opts: {
  baseAmount: number
  startDate: string
  endDate: string | null
  payEveryDays?: number
  prior?: ContractPeriod[]
}): number {
  const base = roundMoney(opts.baseAmount)
  if (base <= 0) return 0
  const every = opts.payEveryDays && opts.payEveryDays > 0 ? Math.floor(opts.payEveryDays) : 14
  const onePeriod = every + 3
  const span = opts.endDate ? daysBetweenInclusive(opts.startDate, opts.endDate) : null

  if (span != null && span > 0) {
    if (span <= onePeriod) return base
    const waves = Math.max(2, Math.round(span / every))
    return roundMoney(base / waves)
  }

  const shortPrior = (opts.prior ?? []).filter(
    (p) => p.endDate && daysBetweenInclusive(p.startDate, p.endDate) <= onePeriod,
  )
  if (shortPrior.length > 0) return base
  return roundMoney(base / 2)
}

export function monthlyFromBiweekly(biweekly: number): number {
  return roundMoney(biweekly * 2)
}

/**
 * Default biweekly split: first half rounds up (39 → 20 + 19).
 * Prefers recorded payment amounts when available.
 */
export function inferBiweeklyInstallments(
  full: number,
  recordedAmounts: number[] = [],
): { first: number; second: number; source: 'payments' | 'split' } {
  const total = Math.round((Number(full) || 0) * 100) / 100
  const paid = recordedAmounts
    .map((a) => Math.round((Number(a) || 0) * 100) / 100)
    .filter((a) => a > 0)

  if (paid.length >= 2) {
    return { first: paid[0], second: paid[1], source: 'payments' }
  }
  if (paid.length === 1 && total > paid[0]) {
    return {
      first: paid[0],
      second: Math.round((total - paid[0]) * 100) / 100,
      source: 'payments',
    }
  }

  if (total <= 0) return { first: 0, second: 0, source: 'split' }
  const first = Math.ceil(total / 2)
  const second = Math.round((total - first) * 100) / 100
  return { first, second, source: 'split' }
}

export type BiweeklyInstallment = {
  dueOn: string
  amount: number
  index: number
  label: string
}

/** Generate biweekly dues from contract start until end (or through `through` if open). */
export function buildBiweeklySchedule(opts: {
  startDate: string
  endDate: string | null
  through: string
  first: number
  second: number
  everyDays?: number
  max?: number
}): BiweeklyInstallment[] {
  const every = opts.everyDays && opts.everyDays > 0 ? opts.everyDays : 14
  const hardEnd = opts.endDate && opts.endDate < opts.through ? opts.endDate : opts.through
  if (!opts.startDate || hardEnd < opts.startDate) return []

  const out: BiweeklyInstallment[] = []
  let due = opts.startDate
  let i = 0
  const max = opts.max ?? 36

  while (due <= hardEnd && i < max) {
    const amount = i % 2 === 0 ? opts.first : opts.second
    out.push({
      dueOn: due,
      amount,
      index: i,
      label: i % 2 === 0 ? '1st half (month payment)' : '2nd half (month payment)',
    })
    due = addDays(due, every)
    i += 1
  }
  return out
}

export function calendarMonthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = `${yearMonth}-01`
  const endDate = new Date(Date.UTC(y, m, 0)) // last day of month
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** Full calendar span for the last N months ending in the month of `today`. */
export function lastCalendarMonthsRange(
  today: string,
  count: number,
): { start: string; end: string; keys: string[] } {
  const current = today.slice(0, 7)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    keys.push(shiftYearMonth(current, -i))
  }
  const start = calendarMonthBounds(keys[0]).start
  const endMonth = calendarMonthBounds(keys[keys.length - 1])
  const end = today < endMonth.end ? today : endMonth.end
  return { start, end: endMonth.end, keys }
}

/** Calendar YYYY-MM keys covering an inclusive date range. */
export function yearMonthsInRange(from: string, to: string): string[] {
  if (!from || !to || to < from) return []
  const keys: string[] = []
  let key = from.slice(0, 7)
  const end = to.slice(0, 7)
  while (key <= end) {
    keys.push(key)
    key = shiftYearMonth(key, 1)
  }
  return keys
}
