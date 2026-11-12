/** How long the previous contract ran — drives the duplicate button label. */
export type ContractPeriodKind = 'biweekly' | 'monthly' | 'custom'

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function calendarMonthRange(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number)
  const start = `${yearMonth}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * Classify a closed date window.
 * Biweekly ≈ 2 weeks (≤17 days, matching pay-wave helpers).
 * Monthly ≈ 26–35 days, or a full calendar month.
 * Anything else keeps the same day span as custom.
 */
export function classifyContractPeriod(
  startDate: string,
  endDate: string,
): ContractPeriodKind {
  const span = daysBetweenInclusive(startDate, endDate)
  if (span <= 0) return 'custom'
  if (isCalendarMonthWindow(startDate, endDate)) return 'monthly'
  if (span <= 17) return 'biweekly'
  if (span >= 26 && span <= 35) return 'monthly'
  return 'custom'
}

function isCalendarMonthWindow(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-01$/.test(startDate)) return false
  const { end } = calendarMonthRange(startDate.slice(0, 7))
  return endDate === end
}

function nextYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

/** Day after the previous end, same length (or next calendar month when that fits). */
export function nextContractPeriodDates(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string; kind: ContractPeriodKind } {
  const kind = classifyContractPeriod(startDate, endDate)
  const newStart = addDays(endDate, 1)

  if (kind === 'monthly' && isCalendarMonthWindow(startDate, endDate)) {
    const next = calendarMonthRange(nextYearMonth(startDate.slice(0, 7)))
    return { startDate: next.start, endDate: next.end, kind }
  }

  const span = daysBetweenInclusive(startDate, endDate)
  return {
    startDate: newStart,
    endDate: addDays(newStart, Math.max(span, 1) - 1),
    kind,
  }
}

export function duplicateContractButtonLabel(kind: ContractPeriodKind): string {
  if (kind === 'biweekly') return 'Duplicate contract for next biweekly'
  if (kind === 'monthly') return 'Duplicate contract for next monthly'
  return 'Duplicate contract for next period'
}
