'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { CommissionEstimate, CommissionEstimateOption } from '@/lib/commission'

export function CommissionEstimateCards({
  estimate,
  options,
  selectedId,
  today,
  panel,
  basePath,
  showCreator = true,
  currency = 'SAR',
  labels,
}: {
  estimate: CommissionEstimate
  options: CommissionEstimateOption[]
  selectedId: 'all' | number
  today: string
  panel: string
  basePath: string
  showCreator?: boolean
  currency?: string
  labels: {
    scope: string
    allContracts: string
    current: string
    did: string
    didHint: string
    goingToDo: string
    goingHint: string
    recorded: string
    recordedHint: string
    payNow: string
    payNowHint: string
    units: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setScope(value: string) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', panel)
    if (!value || value === 'all') next.delete('cmContract')
    else next.set('cmContract', value)
    const qs = next.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  const selected =
    typeof selectedId === 'number' ? options.find((o) => o.id === selectedId) : null

  return (
    <div className="flex flex-col gap-3">
      <label className="flex max-w-md flex-col gap-1 text-xs text-muted-foreground">
        {labels.scope}
        <select
          value={selectedId === 'all' ? 'all' : String(selectedId)}
          onChange={(e) => setScope(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">
            {labels.allContracts} ({options.length})
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {showCreator ? `${o.creatorName} · ` : ''}
              {o.name}
              {' · '}
              {formatDate(o.startDate)}
              {o.endDate ? ` → ${formatDate(o.endDate)}` : ` → ${today}`}
              {o.isActive ? ` · ${labels.current}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <EstimateCard
          value={formatMoney(estimate.did, currency)}
          label={labels.did}
          hint={labels.didHint}
        />
        <EstimateCard
          value={formatMoney(estimate.goingToDo, currency)}
          label={labels.goingToDo}
          hint={labels.goingHint}
        />
        <EstimateCard
          value={formatMoney(estimate.recorded, currency)}
          label={labels.recorded}
          hint={labels.recordedHint}
        />
        <EstimateCard
          value={formatMoney(estimate.payNow, currency)}
          label={labels.payNow}
          hint={labels.payNowHint}
          emphasis={estimate.payNow > 0.009}
        />
      </div>

      <p className="text-xs tabular-nums text-muted-foreground">
        {estimate.contractCount} {estimate.contractCount === 1 ? 'contract' : 'contracts'}
        {' · '}
        {formatNumber(estimate.views)} views
        {' · '}
        {estimate.qualifiedUnits} {labels.units}
        {' · '}
        {estimate.units} videos
        {estimate.remainingUnits > 0
          ? ` · ${estimate.remainingUnits} blocks still in deal`
          : ''}
        {selected
          ? ` · ${showCreator ? `${selected.creatorName} · ` : ''}${selected.name}`
          : ''}
      </p>
    </div>
  )
}

function EstimateCard({
  value,
  label,
  hint,
  emphasis,
}: {
  value: string
  label: string
  hint: string
  emphasis?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasis ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
