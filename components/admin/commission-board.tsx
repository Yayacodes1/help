'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { updateCommissionSettings } from '@/app/actions/admin'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { CommissionTermsFields } from '@/components/admin/commission-terms-fields'
import { ScoreDot, StandingBadge } from '@/components/standing-badge'
import { formatMoney, formatNumber } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'
import type { CommissionBoard, CommissionEstimate, CommissionEstimateOption } from '@/lib/commission'
import { CommissionEstimateCards } from '@/components/admin/commission-estimate'

function vsLabel(vs: number | null): string {
  if (vs == null) return '—'
  const pct = Math.round(Math.abs(vs) * 100)
  if (pct === 0) return 'On average'
  return vs > 0 ? `${pct}% cheaper` : `${pct}% costlier`
}

export function CommissionBoardPanel({
  board,
  today,
  linkRole,
  projectId,
  estimate,
  estimateOptions,
  estimateScope,
  labels,
}: {
  board: CommissionBoard
  today: string
  linkRole?: string | null
  projectId?: number | string | null
  estimate: CommissionEstimate
  estimateOptions: CommissionEstimateOption[]
  estimateScope: 'all' | number
  labels: {
    settings: string
    save: string
    leaderboard: string
    empty: string
    rank: string
    person: string
    standing: string
    views: string
    paid: string
    earned: string
    qualified: string
    costPer1k: string
    vsGroup: string
    team: string
    estimateScope: string
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
  const [pending, startTransition] = useTransition()

  function setRange(from: string, to: string) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'commission')
    next.set('cmFrom', from)
    next.set('cmTo', to)
    router.push(`/admin?${next.toString()}`)
  }

  const top = board.leaderboard.slice(0, 3)

  return (
    <div className="flex flex-col gap-5">
      <form
        action={(fd) => startTransition(() => updateCommissionSettings(fd))}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h3 className="text-sm font-semibold">{labels.settings}</h3>
        <div className="mt-3">
          <CommissionTermsFields
            variant="house"
            countMode={board.settings.countMode}
            viewsThreshold={board.settings.viewsThreshold}
            viewCommissionAmount={board.settings.commissionAmount}
            commissionReels={board.settings.reelCount}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {labels.save}
        </button>
      </form>

      <CommissionEstimateCards
        estimate={estimate}
        options={estimateOptions}
        selectedId={estimateScope}
        today={today}
        panel="commission"
        basePath="/admin"
        currency="SAR"
        labels={{
          scope: labels.estimateScope,
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

      <DateRangePresets today={today} from={board.from} to={board.to} onSelect={setRange} />

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">{formatNumber(board.totals.views)}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels.views}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">{formatMoney(board.totals.paid)}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels.paid}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(board.totals.commissionEarned, 'SAR')}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels.earned}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">
            {board.totals.costPer1k != null ? formatMoney(board.totals.costPer1k) : '—'}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {labels.team} {labels.costPer1k}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">{labels.leaderboard}</h3>
        {top.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ol className="mt-2 grid gap-2 sm:grid-cols-3">
            {top.map((row) => (
              <li
                key={row.creatorId}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">#{row.rank}</span>
                  <StandingBadge standing={row.standing} size="sm" />
                </div>
                <Link
                  href={adminPersonHref(row.creatorId, {
                    role: linkRole,
                    projectId,
                    panel: 'commission',
                    from: 'commission',
                  })}
                  className="mt-2 block truncate font-semibold underline-offset-4 hover:underline"
                >
                  {row.name}
                </Link>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {formatNumber(row.views)} {labels.views}
                  {' · '}
                  {row.costPer1k != null ? formatMoney(row.costPer1k) : '—'}/1k
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {board.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">{labels.rank}</th>
                <th className="px-3 py-2 font-medium">{labels.person}</th>
                <th className="px-3 py-2 font-medium">{labels.standing}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.views}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.qualified}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.earned}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.paid}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.costPer1k}</th>
                <th className="px-3 py-2 font-medium">{labels.vsGroup}</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.creatorId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.rank ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={adminPersonHref(row.creatorId, {
                        role: linkRole,
                        projectId,
                        panel: 'commission',
                        from: 'commission',
                      })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <ScoreDot score={row.viewsScore} label="Views" />
                      <ScoreDot score={row.commissionScore} label="Commission" />
                      <ScoreDot score={row.spendScore} label="Cost" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StandingBadge standing={row.standing} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.qualifiedUnits}
                    <span className="text-muted-foreground"> / {row.units}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.commissionAssigned
                      ? formatMoney(row.commissionEarned, 'SAR')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.costPer1k != null ? formatMoney(row.costPer1k) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{vsLabel(row.vsGroup)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
