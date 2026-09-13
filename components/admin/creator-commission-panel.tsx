'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { CommissionEstimate, CommissionEstimateOption, CommissionUnitLine } from '@/lib/commission'
import { CommissionEstimateCards } from '@/components/admin/commission-estimate'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { ScoreDot, StandingBadge } from '@/components/standing-badge'
import type { Standing } from '@/lib/commission'

const inputClass =
  'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function CreatorCommissionPanel({
  creatorId,
  today,
  estimate,
  options,
  selectedId,
  from,
  to,
  lines,
  totalSar,
  termsSummary,
  refreshLabel,
  perf,
  labels,
}: {
  creatorId: number
  today: string
  estimate: CommissionEstimate
  options: CommissionEstimateOption[]
  selectedId: 'all' | number
  from: string
  to: string
  lines: CommissionUnitLine[]
  totalSar: number
  termsSummary: string | null
  refreshLabel: string
  perf: {
    standing: Standing
    viewsScore: number | null
    commissionScore: number | null
    spendScore: number | null
    views: number
    qualifiedUnits: number
    units: number
    commissionEarned: number
    paid: number
    costPer1k: number | null
  } | null
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
    empty: string
    missing: string
    earned: string
    qualified: string
    views: string
    paid: string
    costPer1k: string
    dateRange: string
    perVideo: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setDates(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'commission')
    next.set('cmFrom', nextFrom)
    next.set('cmTo', nextTo)
    router.push(`/admin/creators/${creatorId}?${next.toString()}`)
  }

  const selected =
    typeof selectedId === 'number' ? options.find((o) => o.id === selectedId) : null
  const refreshFrom = selected?.startDate ?? from
  const refreshTo = selected?.endDate ?? to

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.dateRange}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setDates(e.target.value, to)}
              className={inputClass}
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setDates(from, e.target.value)}
              className={inputClass}
            />
          </div>
        </label>
        <Suspense fallback={<p className="text-xs text-muted-foreground">Loading refresh…</p>}>
          <RefreshViewsButton
            label={refreshLabel}
            creatorId={creatorId}
            defaultFrom={refreshFrom}
            defaultTo={refreshTo}
          />
        </Suspense>
      </div>

      <CommissionEstimateCards
        estimate={estimate}
        options={options}
        selectedId={selectedId}
        today={today}
        panel="commission"
        basePath={`/admin/creators/${creatorId}`}
        showCreator={false}
        currency="SAR"
        labels={{
          scope: labels.scope,
          allContracts: labels.allContracts,
          current: labels.current,
          did: labels.did,
          didHint: labels.didHint,
          goingToDo: labels.goingToDo,
          goingHint: labels.goingHint,
          recorded: labels.recorded,
          recordedHint: labels.recordedHint,
          payNow: labels.payNow,
          payNowHint: labels.payNowHint,
          units: labels.units,
        }}
      />

      {perf ? (
        <div className="flex flex-col gap-3">
          <StandingBadge standing={perf.standing} />
          <div className="flex flex-wrap gap-3">
            <ScoreDot score={perf.viewsScore} label={labels.views} />
            <ScoreDot score={perf.commissionScore} label={labels.earned} />
            <ScoreDot score={perf.spendScore} label={labels.costPer1k} />
          </div>
          <p className="text-sm tabular-nums">
            {formatNumber(perf.views)} {labels.views}
            {' · '}
            {perf.qualifiedUnits} {labels.qualified.toLowerCase()}
            {' · '}
            {perf.units} videos
            {' · '}
            {labels.earned} {formatMoney(perf.commissionEarned, 'SAR')}
            {' · '}
            {labels.paid} {formatMoney(perf.paid)}
            {perf.costPer1k != null ? ` · ${formatMoney(perf.costPer1k, 'SAR')} / 1k` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {termsSummary ?? labels.missing}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{labels.perVideo}</h3>
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(totalSar, 'SAR')}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              · {lines.reduce((s, l) => s + l.chunks, 0)} blocks · {lines.length} videos
            </span>
          </p>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {labels.empty}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {lines.map((line) => {
              const platformLabel = line.platforms
                .map((p) => (p === 'instagram' ? 'IG' : 'TT'))
                .join('+')
              return (
                <li
                  key={line.key}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">
                      {line.videoDate ? formatDate(line.videoDate) : '—'}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {platformLabel}
                        {line.batchIndex != null ? ` · batch #${line.batchIndex}` : ''}
                      </span>
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatNumber(line.views)} views
                      {' · '}
                      {line.chunks}× paid block{line.chunks === 1 ? '' : 's'}
                      {line.urls[0] ? (
                        <>
                          {' · '}
                          <a
                            href={line.urls[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            open
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums font-semibold text-foreground">
                    {formatMoney(line.commissionSar, 'SAR')}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
