export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}
