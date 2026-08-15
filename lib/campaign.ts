// Submissions can be logged for any date within the current calendar year.
export function yearRange(today: string): { start: string; end: string } {
  const year = today.slice(0, 4)
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

// Add (or subtract) days to a YYYY-MM-DD string using UTC to avoid timezone drift.
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/**
 * Parse a date from the assistant (or UI) into YYYY-MM-DD.
 * Bare month/day uses `today`'s year. Models often emit 2024/2025; those years
 * are remapped onto the current campaign year (the only year we store).
 */
export function parseFlexibleDate(value: unknown, today: string): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const currentYear = Number(today.slice(0, 4))
  if (!Number.isFinite(currentYear)) return null

  const remapYear = (y: number) => (y === currentYear ? y : currentYear)

  let m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (m) return ymd(remapYear(Number(m[1])), Number(m[2]), Number(m[3]))

  m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return ymd(remapYear(Number(m[3])), Number(m[1]), Number(m[2]))

  m = raw.match(/^(\d{1,2})[/-](\d{1,2})$/)
  if (m) return ymd(currentYear, Number(m[1]), Number(m[2]))

  const cleaned = raw
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const monthNames = Object.keys(MONTH_INDEX).join('|')
  m = cleaned.match(new RegExp(`^(${monthNames})\\s+(\\d{1,2})(?:\\s+(\\d{4}))?$`, 'i'))
  if (m) {
    const month = MONTH_INDEX[m[1].toLowerCase()]
    const year = m[3] ? remapYear(Number(m[3])) : currentYear
    return ymd(year, month, Number(m[2]))
  }
  m = cleaned.match(new RegExp(`^(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?$`, 'i'))
  if (m) {
    const month = MONTH_INDEX[m[2].toLowerCase()]
    const year = m[3] ? remapYear(Number(m[3])) : currentYear
    return ymd(year, month, Number(m[1]))
  }

  return null
}

/** Min/max of two YYYY-MM-DD strings. */
export function minDate(a: string, b: string): string {
  return a <= b ? a : b
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}
