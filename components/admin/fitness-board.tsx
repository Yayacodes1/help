'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  setCreatorFitnessTierAction,
  bulkProtectTopCreators,
  bulkProbationBottomCreators,
} from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { formatNumber } from '@/lib/format'
import {
  sortFitnessRows,
  type FitnessBoard,
  type FitnessSort,
} from '@/lib/creator-fitness'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { PanelProjectFilter } from '@/components/admin/panel-project-filter'

export function FitnessBoardPanel({
  board,
  projects,
  projectId,
  labels,
}: {
  board: FitnessBoard
  projects: Array<{ id: number; name: string }>
  projectId?: number | null
  labels: {
    hint: string
    allProjects: string
    chooseProject: string
    protect: string
    probation: string
    clear: string
    protectTop15: string
    probationCuts: string
    keep: string
    watch: string
    cut: string
    protected: string
    onProbation: string
    paused: string
    quwa: string
    score: string
    views: string
    consistency: string
    action: string
    empty: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [sort, setSort] = useState<FitnessSort>('quwa')
  const [pending, startTransition] = useTransition()

  const rows = useMemo(() => sortFitnessRows(board.rows, sort), [board.rows, sort])

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'fitness')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(() => {
      void fn().then(() => router.refresh())
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xl font-semibold tabular-nums">{formatNumber(board.totalViews)}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.views}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xl font-semibold tabular-nums">
            {Math.round(board.top15Share * 100)}%
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Top 15 share
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xl font-semibold tabular-nums">
            {board.rows.filter((r) => r.tier === 'protected').length}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.protected}
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="text-xl font-semibold tabular-nums">
            {board.rows.filter((r) => r.tier === 'probation' || r.action === 'cut').length}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.cut} / {labels.onProbation}
          </div>
        </div>
      </div>

      <PanelProjectFilter
        projects={projects}
        projectId={projectId}
        panel="fitness"
        promptWhenAll
        labels={{ allProjects: labels.allProjects, chooseProject: labels.chooseProject }}
      />
      <DateRangePresets
        today={board.today}
        from={board.from}
        to={board.to}
        onSelect={(nextFrom, nextTo) => push({ fitFrom: nextFrom, fitTo: nextTo })}
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={board.from}
            onChange={(e) => push({ fitFrom: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={board.to}
            onChange={(e) => push({ fitTo: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as FitnessSort)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="quwa">{labels.quwa} ↑</option>
            <option value="score">{labels.score} ↑</option>
            <option value="views">{labels.views} ↓</option>
            <option value="consistency">{labels.consistency} ↑</option>
            <option value="cut">{labels.action}</option>
            <option value="number"># / name</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => bulkProtectTopCreators(15, board.from, board.to, projectId ?? null))}
          className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          {labels.protectTop15}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => bulkProbationBottomCreators(board.from, board.to, projectId ?? null))
          }
          className="h-9 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-[#9a0d18] hover:bg-rose-500/20 disabled:opacity-50 dark:text-card-foreground"
        >
          {labels.probationCuts}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">{labels.views}</th>
                <th className="px-3 py-2 font-medium">{labels.consistency}</th>
                <th className="px-3 py-2 font-medium">{labels.score}</th>
                <th className="px-3 py-2 font-medium">{labels.quwa}</th>
                <th className="px-3 py-2 font-medium">{labels.action}</th>
                <th className="px-3 py-2 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr
                  key={r.creatorId}
                  className={`align-middle ${
                    r.action === 'cut' || r.tier === 'probation'
                      ? 'bg-rose-500/5'
                      : r.tier === 'protected'
                        ? 'bg-emerald-500/5'
                        : ''
                  }`}
                >
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={adminPersonHref(r.creatorId)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.paused ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">
                        {labels.paused}
                      </span>
                    ) : null}
                    {r.projectName ? (
                      <div className="text-[11px] text-muted-foreground">{r.projectName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatNumber(r.views)}
                    <div className="text-[10px] text-muted-foreground">
                      {Math.round(r.viewsShare * 1000) / 10}%
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Math.round(r.consistency * 100)}%
                    <div className="text-[10px] text-muted-foreground">
                      {r.postDays}/{r.daySpan}d
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.score}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.quwa}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        r.action === 'cut'
                          ? 'bg-rose-500/15 text-[#9a0d18] dark:text-card-foreground'
                          : r.action === 'watch'
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                            : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                      }`}
                    >
                      {r.action === 'cut'
                        ? labels.cut
                        : r.action === 'watch'
                          ? labels.watch
                          : labels.keep}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.tier === 'protected' ? (
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          {labels.protected}
                        </span>
                      ) : null}
                      {r.tier === 'probation' ? (
                        <span className="text-[11px] font-medium text-[#9a0d18] dark:text-rose-300">
                          {labels.onProbation}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={pending || r.tier === 'protected'}
                        onClick={() =>
                          run(() => setCreatorFitnessTierAction(r.creatorId, 'protected'))
                        }
                        className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent disabled:opacity-40"
                      >
                        {labels.protect}
                      </button>
                      <button
                        type="button"
                        disabled={pending || r.tier === 'probation'}
                        onClick={() =>
                          run(() => setCreatorFitnessTierAction(r.creatorId, 'probation'))
                        }
                        className="rounded border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-medium hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        {labels.probation}
                      </button>
                      {r.tier ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => setCreatorFitnessTierAction(r.creatorId, null))
                          }
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
                        >
                          {labels.clear}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
