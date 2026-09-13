export function formatYearMonth(
  yearMonth: string,
  locale: 'en' | 'ar' | string = 'en',
): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  const d = new Date(Date.UTC(year, month - 1, 1))
  const loc = locale === 'ar' || String(locale).startsWith('ar') ? 'ar' : 'en-US'
  return d.toLocaleDateString(loc, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: 'en' | 'ar' | string = 'en',
): string {
  if (value == null || value === '') return '—'
  let d: Date
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number)
    d = new Date(y, m - 1, day)
  } else {
    d = typeof value === 'string' ? new Date(value) : value
  }
  if (Number.isNaN(d.getTime())) return '—'
  const loc = locale === 'ar' || String(locale).startsWith('ar') ? 'ar' : 'en-US'
  return d.toLocaleString(loc, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}

/** Primary display currency for the app (Saudi riyal). */
export const PRIMARY_CURRENCY = 'SAR' as const

export function formatMoney(value: number, currency: string = PRIMARY_CURRENCY): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}
