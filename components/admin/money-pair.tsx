import { formatMoney } from '@/lib/format'
import { sarToUsd } from '@/lib/payment-calendar-math'

export function MoneyPair({
  sar,
  usd,
  big = false,
  stacked = false,
  tone = 'default',
}: {
  sar: number
  usd?: number
  big?: boolean
  stacked?: boolean
  tone?: 'default' | 'inherit'
}) {
  const dollar = usd ?? sarToUsd(sar)
  const usdColor = tone === 'inherit' || big ? 'opacity-90' : 'text-muted-foreground'
  return (
    <span
      className={`inline-flex items-baseline gap-x-1.5 ${stacked ? 'flex-col items-end gap-y-0.5' : 'flex-wrap'}`}
    >
      <span className={`tabular-nums ${big ? 'text-sm font-bold sm:text-lg' : 'font-semibold'}`}>
        {formatMoney(sar, 'SAR')}
      </span>
      <span className={`tabular-nums ${big ? 'text-[11px] font-semibold sm:text-sm' : 'text-sm font-medium'} ${usdColor}`}>
        {formatMoney(dollar, 'USD')}
      </span>
    </span>
  )
}
