import { formatMoney } from '@/lib/format'
import { usdToSar } from '@/lib/fx'

function CadenceRow({ label, usd }: { label: string; usd: number }) {
  return (
    <div>
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-0.5 tabular-nums leading-snug">
        {formatMoney(usdToSar(usd), 'SAR')} in riyal
      </p>
      <p className="tabular-nums leading-snug">{formatMoney(usd, 'USD')} in dollars</p>
    </div>
  )
}

export function PayCadences({
  monthlyUsd,
  biweeklyUsd,
}: {
  monthlyUsd: number
  biweeklyUsd: number
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <CadenceRow label="Monthly" usd={monthlyUsd} />
      <CadenceRow label="Biweekly" usd={biweeklyUsd} />
    </div>
  )
}
