const SAR_PER_USD = 3.75

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function usdToSar(usd: number): number {
  return Math.round(usd * SAR_PER_USD * 100) / 100
}

export type CalendarPayStatus = 'paid' | 'partial' | 'due' | 'overdue' | 'scheduled'

export type CalendarTxn = {
  id: number
  creatorId: number
  contractId: number | null
  paidOn: string
  amountSar: number
}

export type CalendarObligationLite = {
  key: string
  creatorId: number
  contractId: number
  installmentIndex: number
  dueDate: string
  dueAmount: number
  dueAmountSar: number
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function amountToSar(amount: number, currency: 'USD' | 'SAR'): number {
  return currency === 'USD' ? usdToSar(amount) : roundMoney(amount)
}

export function statusFor(opts: {
  remainingSar: number
  paidAmountSar: number
  dueDate: string
  today: string
}): CalendarPayStatus {
  if (opts.remainingSar <= 0.009) return 'paid'
  if (opts.paidAmountSar > 0.009) return 'partial'
  if (opts.dueDate < opts.today) return 'overdue'
  if (opts.dueDate === opts.today) return 'due'
  return 'scheduled'
}

export function settleObligationsLite(
  obligations: CalendarObligationLite[],
  payments: CalendarTxn[],
  today: string,
): {
  items: Array<
    CalendarObligationLite & {
      paidAmountSar: number
      remainingSar: number
      status: CalendarPayStatus
      lastPaidOn: string | null
    }
  >
  leftover: Array<CalendarTxn & { leftoverSar: number }>
} {
  const remainingByKey = new Map(obligations.map((o) => [o.key, o.dueAmountSar]))
  const paidByKey = new Map<string, number>()
  const lastPaidByKey = new Map<string, string>()
  const leftover: Array<CalendarTxn & { leftoverSar: number }> = []

  const byContract = new Map<number, CalendarObligationLite[]>()
  const byCreator = new Map<number, CalendarObligationLite[]>()
  for (const o of obligations) {
    const list = byContract.get(o.contractId) ?? []
    list.push(o)
    byContract.set(o.contractId, list)
    const cList = byCreator.get(o.creatorId) ?? []
    cList.push(o)
    byCreator.set(o.creatorId, cList)
  }
  for (const list of byContract.values()) {
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentIndex - b.installmentIndex)
  }
  for (const list of byCreator.values()) {
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentIndex - b.installmentIndex)
  }

  const orderedPays = [...payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.id - b.id)

  function applyTo(list: CalendarObligationLite[], amountSar: number, paidOn: string): number {
    let left = roundMoney(amountSar)
    for (const o of list) {
      if (left <= 0.009) break
      const still = remainingByKey.get(o.key) ?? 0
      if (still <= 0.009) continue
      const take = Math.min(still, left)
      remainingByKey.set(o.key, roundMoney(still - take))
      paidByKey.set(o.key, roundMoney((paidByKey.get(o.key) ?? 0) + take))
      lastPaidByKey.set(o.key, paidOn)
      left = roundMoney(left - take)
    }
    return left
  }

  for (const pay of orderedPays) {
    const pool =
      pay.contractId != null
        ? (byContract.get(pay.contractId) ?? byCreator.get(pay.creatorId) ?? [])
        : (byCreator.get(pay.creatorId) ?? [])
    const leftoverSar = applyTo(pool, pay.amountSar, pay.paidOn)
    if (leftoverSar > 0.009) leftover.push({ ...pay, leftoverSar })
  }

  const items = obligations.map((o) => {
    const paidAmountSar = paidByKey.get(o.key) ?? 0
    const remainingSar = remainingByKey.get(o.key) ?? o.dueAmountSar
    return {
      ...o,
      paidAmountSar,
      remainingSar,
      status: statusFor({ remainingSar, paidAmountSar, dueDate: o.dueDate, today }),
      lastPaidOn: lastPaidByKey.get(o.key) ?? null,
    }
  })
  return { items, leftover }
}

export function weekdayIndexMondayFirst(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return (utc + 6) % 7
}

/** Nov 1 start → first 15-day-method pay on Nov 15. */
export const FIFTEEN_DAY_OFFSET = 14
export const FIFTEEN_DAY_STEP = 15
export const TWO_WEEK_DAYS = 14

export type PayTiming = 'fifteen' | 'upfront' | 'end'

export type PayUrgency = 'urgent' | 'soon' | 'safe' | 'none'

export type CreatorPaySlice = {
  dueOn: string
  index: number
  label: string
}

export function daysAhead(today: string, date: string): number {
  const a = Date.parse(`${today}T00:00:00Z`)
  const b = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** Red = overdue through the next 3 days; orange = the 2 days after that; green = later. */
export function urgencyFor(date: string, today: string, remainingSar: number): PayUrgency {
  if (remainingSar <= 0.009) return 'none'
  const ahead = daysAhead(today, date)
  if (ahead <= 3) return 'urgent'
  if (ahead <= 5) return 'soon'
  return 'safe'
}

export function sarToUsd(sar: number): number {
  return roundMoney((Number(sar) || 0) / SAR_PER_USD)
}

/** First half rounds up (39 → 20 + 19), same as contract pay entry. */
export function splitInTwo(total: number): { first: number; second: number } {
  const amount = roundMoney(total)
  if (amount <= 0) return { first: 0, second: 0 }
  const first = Math.ceil(amount / 2)
  return { first, second: roundMoney(amount - first) }
}

/**
 * One amount per scheduled pay. Biweekly keeps the entered amount on every pay.
 * Monthly is one payment of the full amount. Flat commission sits on the last pay.
 */
export function amountsForPaySlices(opts: {
  baseAmount: number
  cadence: 'monthly' | 'biweekly'
  commission: number
  sliceCount: number
}): number[] {
  const n = Math.max(0, Math.floor(opts.sliceCount))
  if (n <= 0) return []
  const base = roundMoney(opts.baseAmount)
  const commission = roundMoney(opts.commission)
  if (opts.cadence !== 'biweekly') {
    const amounts = Array.from({ length: n }, () => 0)
    amounts[n - 1] = roundMoney(base + commission)
    return amounts
  }
  const amounts: number[] = []
  for (let i = 0; i < n; i++) amounts.push(base)
  if (commission > 0.009) {
    amounts[n - 1] = roundMoney(amounts[n - 1] + commission)
  }
  return amounts.map(roundMoney)
}

export function normalizePayTiming(value: string | null | undefined): PayTiming | null {
  const raw = (value ?? '').toString().trim().toLowerCase()
  if (raw === 'fifteen' || raw === 'upfront' || raw === 'end') return raw
  if (raw === 'one-time' || raw === 'onetime' || raw === 'once' || raw === 'final') return 'end'
  return null
}

export function resolvePayTiming(opts: {
  stored?: string | null
  startDate: string
  endDate: string | null
  paidOn?: string[]
  notes?: string[]
}): PayTiming {
  const stored = normalizePayTiming(opts.stored)
  if (stored) return stored
  const notes = (opts.notes ?? []).join(' ').toLowerCase()
  if (notes.includes('upfront')) return 'upfront'
  const firstPaid = [...(opts.paidOn ?? [])].filter(Boolean).sort()[0]
  if (firstPaid) {
    const delta = daysAhead(opts.startDate, firstPaid)
    if (delta >= -1 && delta <= 2) return 'upfront'
  }
  if (!opts.endDate) return 'fifteen'
  const span = daysAhead(opts.startDate, opts.endDate) + 1
  if (span > TWO_WEEK_DAYS + 3) return 'fifteen'
  return 'end'
}

function installmentCount(startDate: string, endDate: string, every: number): number {
  const span = daysAhead(startDate, endDate) + 1
  if (span <= every + 3) return 1
  return Math.max(2, Math.round(span / every))
}

function labelForSlice(timing: PayTiming, index: number, last: boolean, total: number): string {
  if (timing === 'upfront' && index === 0) return 'Upfront'
  if (last && (timing === 'end' || total === 1 || timing === 'fifteen')) return total === 1 ? 'Final payment' : 'Final payment'
  if (index === 0) return 'First payment'
  if (index === 1) return 'Second payment'
  return `Payment ${index + 1}`
}

/**
 * fifteen: first pay on day 15, then every 15 days, last pay on contract end.
 * upfront: first pay on start, then every 2 weeks until the contract ends.
 * end: one pay on the contract end date.
 */
export function buildCreatorPaySchedule(opts: {
  startDate: string
  endDate: string | null
  timing: PayTiming
  through: string
  max?: number
}): CreatorPaySlice[] {
  if (!opts.startDate) return []
  const end = opts.endDate
  const through = opts.through
  const max = opts.max ?? 24
  const dates: string[] = []

  if (opts.timing === 'end') {
    if (!end || end < opts.startDate) return []
    return [{ dueOn: end, index: 0, label: 'Final payment' }]
  }

  if (!end) {
    const first =
      opts.timing === 'upfront' ? opts.startDate : addDays(opts.startDate, FIFTEEN_DAY_OFFSET)
    const step = opts.timing === 'upfront' ? TWO_WEEK_DAYS : FIFTEEN_DAY_STEP
    let due = first
    for (let i = 0; i < max && due <= through; i++) {
      if (due >= opts.startDate) dates.push(due)
      due = addDays(due, step)
    }
  } else if (opts.timing === 'upfront') {
    const count = Math.min(max, installmentCount(opts.startDate, end, TWO_WEEK_DAYS))
    for (let i = 0; i < count; i++) {
      const due = addDays(opts.startDate, TWO_WEEK_DAYS * i)
      dates.push(due > end ? end : due)
    }
  } else {
    const count = Math.min(max, installmentCount(opts.startDate, end, FIFTEEN_DAY_STEP))
    const first = addDays(opts.startDate, FIFTEEN_DAY_OFFSET)
    if (count <= 1) {
      dates.push(end)
    } else {
      dates.push(first > end ? end : first)
      for (let i = 1; i < count - 1; i++) {
        const due = addDays(first, FIFTEEN_DAY_STEP * i)
        if (due < end) dates.push(due)
      }
      dates.push(end)
    }
  }

  const unique = [...new Set(dates.filter((d) => d >= opts.startDate && d <= through))].sort()
  return unique.map((dueOn, index) => ({
    dueOn,
    index,
    label: labelForSlice(opts.timing, index, index === unique.length - 1, unique.length),
  }))
}

/** 2 SAR for every full 2,000 views after 10,000. 12,000 → 2, 14,000 → 4. */
export function reposterViewCommissionSar(views: number): number {
  const over = Math.max(0, Math.floor(views) - 10_000)
  return Math.floor(over / 2_000) * 2
}

export function monthGridDates(start: string, end: string): string[] {
  const lead = weekdayIndexMondayFirst(start)
  const dates: string[] = []
  for (let i = lead; i > 0; i--) dates.push(addDays(start, -i))
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  while (dates.length % 7 !== 0) {
    dates.push(addDays(dates[dates.length - 1], 1))
  }
  return dates
}
