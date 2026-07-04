// Submissions can be logged for any date within the current calendar year.
export function yearRange(today: string): { start: string; end: string } {
  const year = today.slice(0, 4)
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}
