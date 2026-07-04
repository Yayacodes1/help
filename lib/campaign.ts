// The campaign runs for 30 days in July. Videos are logged within this window.
export function campaignRange(today: string): { start: string; end: string } {
  const year = today.slice(0, 4)
  return { start: `${year}-07-01`, end: `${year}-07-30` }
}

// All 30 campaign dates (July 1–30) as YYYY-MM-DD strings, for a date dropdown.
export function campaignDates(year = new Date().getFullYear()): string[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return `${year}-07-${day}`
  })
}
