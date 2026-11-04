'use client'

import { useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { updateCommissionSettings } from '@/app/actions/admin'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { CommissionTermsFields } from '@/components/admin/commission-terms-fields'
import { ScoreDot, StandingBadge } from '@/components/standing-badge'
import { formatMoney, formatNumber } from '@/lib/format'
import { sarToUsd } from '@/lib/fx'
import { calendarMonthRange } from '@/lib/campaign'
import { adminPersonHref } from '@/lib/admin-href'
import type { CommissionEstimate, CommissionEstimateOption } from '@/lib/commission'
import type { MajorityCommissionBoard } from '@/lib/commission-board-types'
import { CommissionEstimateCards } from '@/components/admin/commission-estimate'

function vsLabel(vs: number | null): string {
  if (vs == null) return '—'
  const pct = Math.round(Math.abs(vs) * 100)
  if (pct === 0) return 'On average'
  return vs > 0 ? `${pct}% cheaper` : `${pct}% costlier`
}

function moneyPair(sar: number): string {
  return `${formatMoney(sar, 'SAR')} · ${formatMoney(sarToUsd(sar), 'USD')}`
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', {
    month: 'long',
    timeZone: 'UTC',
  })
  return `${name} ${y}`
}

function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', {
    month: 'short',
    timeZone: 'UTC',
  })
  return `${name} ${String(y).slice(2)}`
}

export function CommissionBoardPanel({
  board,
  today,
  linkRole,
  projectId,
  projects,
  estimate,
  estimateOptions,
  estimateScope,
  labels,
}: {
  board: MajorityCommissionBoard
  today: string
  linkRole?: string | null
  projectId?: number | string | null
  projects: Array<{ id: number; name: string }>
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
    app: string
    allApps: string
    month: string
    days: string
    earnersOnly: string
    majorityHint: string
    totalCommission: string
    contractsInMonth: string
    pickMonth: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const earnersOnly = params.get('cmEarn') === '1'

  const months = useMemo(() => {
    if (board.months.length > 0) return board.months
    // Fallback so chips never disappear if span query fails.
    const out: string[] = []
    let cur = today.slice(0, 7)
    for (let i = 0; i < 6; i++) {
      out.unshift(cur)
      const [y, m] = cur.split('-').map(Number)
      cur = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    }
    return out
  }, [board.months, today])

  const rows = useMemo(() => {
    if (!earnersOnly) return board.rows
    return board.rows.filter((r) => r.commissionEarned > 0)
  }, [board.rows, earnersOnly])

  const earnedTotal = useMemo(
    () => rows.reduce((s, r) => s + r.commissionEarned, 0),
    [rows],
  )

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'commission')
    next.set('tab', 'money')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/admin?${next.toString()}`)
  }

  function selectMonth(ym: string) {
    const { start, end } = calendarMonthRange(ym)
    const to = end > today ? today : end
    push({
      cmMonth: ym,
      cmFrom: start,
      cmTo: to,
    })
  }

  function setRange(from: string, to: string) {
    push({
      cmFrom: from,
      cmTo: to,
      cmMonth: from.slice(0, 7),
    })
  }

  const top = (earnersOnly ? board.leaderboard.filter((r) => r.commissionEarned > 0) : board.leaderboard).slice(
    0,
    3,
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Month / app / days first — was buried under House deal + Estimate. */}
      <div className="rounded-xl border-2 border-primary/40 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{labels.pickMonth}</h3>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="sr-only">{labels.month}</span>
            <select
              value={board.month}
              onChange={(e) => selectMonth(e.target.value)}
              className="h-10 min-w-[12rem] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMonth(m)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                board.month === m
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {monthShort(m)}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{labels.majorityHint}</p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.app}
            <select
              value={projectId != null && String(projectId) !== '' ? String(projectId) : ''}
              onChange={(e) => push({ project: e.target.value || null })}
              className="h-9 min-w-[10rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">{labels.allApps}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.days} · from
            <input
              type="date"
              value={board.from}
              onChange={(e) =>
                push({ cmFrom: e.target.value, cmMonth: e.target.value.slice(0, 7) })
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            to
            <input
              type="date"
              value={board.to}
              onChange={(e) => push({ cmTo: e.target.value })}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium">
            <input
              type="checkbox"
              checked={earnersOnly}
              onChange={(e) => push({ cmEarn: e.target.checked ? '1' : null })}
            />
            {labels.earnersOnly}
          </label>
        </div>

        <div className="mt-3">
          <DateRangePresets today={today} from={board.from} to={board.to} onSelect={setRange} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 sm:col-span-2">
          <div className="text-lg font-semibold tabular-nums">{moneyPair(earnedTotal)}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {labels.totalCommission} · {monthLabel(board.month)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {board.contractCount} {labels.contractsInMonth} · ≥{board.majorityPct}%
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">{formatNumber(board.totals.views)}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels.views}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-lg font-semibold tabular-nums">{formatMoney(board.totals.paid)}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels.paid}</div>
        </div>
      </div>

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
        onlyPayNow
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
                  {moneyPair(row.commissionEarned)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[780px] text-sm">
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
              {rows.map((row) => (
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
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {row.commissionAssigned ? moneyPair(row.commissionEarned) : '—'}
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
