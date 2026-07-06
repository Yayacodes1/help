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
