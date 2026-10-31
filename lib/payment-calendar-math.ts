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

/** First pay is 15 days after contract start; later biweekly waves are +15 each (30, 45, …). */
export const FIRST_PAY_AFTER_DAYS = 15
export const BIWEEKLY_PAY_EVERY_DAYS = 15

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

/**
 * Biweekly: pay 15 days after start, then 30, 45, … until the contract ends.
 * Monthly: one payment on the contract end date.
 */
export function buildCreatorPaySchedule(opts: {
  startDate: string
  endDate: string | null
  cadence: 'monthly' | 'biweekly'
  through: string
  max?: number
}): CreatorPaySlice[] {
  if (!opts.startDate) return []
  const end = opts.endDate
  const through = opts.through
  const max = opts.max ?? 36

  if (opts.cadence === 'monthly' && end) {
    if (end < opts.startDate) return []
    return [{ dueOn: end, index: 0, label: 'Final payment' }]
  }

  const out: CreatorPaySlice[] = []
  for (let i = 0; i < max; i++) {
    let due = addDays(opts.startDate, FIRST_PAY_AFTER_DAYS * (i + 1))
    if (end && due > end) {
      if (out.length === 0) due = end
      else if (end > out[out.length - 1].dueOn) due = end
      else break
    }
    if (due > through) break
    if (due < opts.startDate) continue
    const label = i === 0 ? 'First payment' : i === 1 ? 'Second payment' : `Payment ${i + 1}`
    out.push({ dueOn: due, index: i, label })
    if (end && due >= end) break
  }
  return out
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
