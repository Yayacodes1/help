'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  clearAllProbationCreators,
  markProbationNoticeMessagedAction,
  setCreatorFitnessTierAction,
} from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { PanelProjectFilter } from '@/components/admin/panel-project-filter'
import {
  buildProbationStreakMessage,
  streakBucketFromMisses,
  type ProbationStreakBoard,
  type ProbationStreakPhase,
  type ProbationStreakRow,
} from '@/lib/probation-copy'

type Labels = {
  hint: string
  allProjects: string
  chooseProject: string
  person: string
  project: string
  misses: string
  progress: string
  status: string
  next: string
  started: string
  empty: string
  clear: string
  clearAll: string
  clearAllConfirm: string
  copyArabic: string
  copied: string
  markSent: string
  filterAll: string
  phaseClean: string
  phaseNearVerbal1: string
  phaseDueVerbal1: string
  phaseNearVerbal2: string
  phaseDueVerbal2: string
  phaseNearKick: string
  phaseDueKick: string
  phasePaused: string
  firstStreak: string
  secondStreak: string
  finalStreak: string
}

const PHASE_LABEL: Record<ProbationStreakPhase, keyof Labels> = {
  clean: 'phaseClean',
  near_verbal1: 'phaseNearVerbal1',
  due_verbal1: 'phaseDueVerbal1',
  near_verbal2: 'phaseNearVerbal2',
  due_verbal2: 'phaseDueVerbal2',
  near_kick: 'phaseNearKick',
  due_kick: 'phaseDueKick',
  paused: 'phasePaused',
}

function phaseTone(phase: ProbationStreakPhase): string {
  if (phase === 'due_kick' || phase === 'paused') {
    return 'bg-rose-500/10 text-[#9a0d18] dark:text-card-foreground'
  }
  if (phase === 'due_verbal1' || phase === 'due_verbal2') {
    return 'bg-amber-500/15 text-amber-900 dark:text-amber-100'
  }
  if (phase.startsWith('near_')) {
    return 'bg-sky-500/10 text-sky-900 dark:text-sky-100'
  }
  return 'bg-muted text-muted-foreground'
}

export function ProbationStreaksBoard({
  board,
  projects,
  projectId,
  labels,
}: {
  board: ProbationStreakBoard
  projects: Array<{ id: number; name: string }>
  projectId?: number | null
  labels: Labels
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<'all' | 1 | 2 | 3>('all')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const rows = useMemo(() => {
    if (filter === 'all') return board.rows
    return board.rows.filter((r) => streakBucketFromMisses(r.missCount) === filter)
  }, [board.rows, filter])

  function keepPanel(patch?: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'streaks')
    next.set('tab', 'people')
    if (patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k)
        else next.set(k, v)
      }
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  async function copyArabic(row: ProbationStreakRow) {
    if (!row.pendingNoticeId || !row.pendingLevel) return
    const text = buildProbationStreakMessage({
      id: row.pendingNoticeId,
      creatorId: row.creatorId,
      name: row.name,
      level: row.pendingLevel,
      unlockedOn:
        row.missDates[
          row.pendingLevel === 1 ? 2 : row.pendingLevel === 2 ? 5 : 9
        ] ?? board.today,
      missDates: row.missDates.slice(-2),
      messagedAt: null,
      missCount: row.missCount,
    })
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(row.pendingNoticeId)
      window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      window.prompt('Copy message:', text)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>

      <PanelProjectFilter
        projects={projects}
        projectId={projectId}
        panel="streaks"
        promptWhenAll
        labels={{
          allProjects: labels.allProjects,
          chooseProject: labels.chooseProject,
        }}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label={labels.firstStreak} value={board.counts.first} tone="sky" />
        <Stat label={labels.secondStreak} value={board.counts.second} tone="amber" />
        <Stat label={labels.finalStreak} value={board.counts.final} tone="rose" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {(
            [
              ['all', labels.filterAll],
              [1, labels.firstStreak],
              [2, labels.secondStreak],
              [3, labels.finalStreak],
            ] as const
          ).map(([key, label]) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {board.counts.total > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(labels.clearAllConfirm)) return
              startTransition(() => {
                void clearAllProbationCreators(projectId ?? null).then(() =>
                  router.refresh(),
                )
              })
            }}
            className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {labels.clearAll}
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-sky-700 dark:text-sky-300">
          3 · {labels.firstStreak}
        </span>
        {' · '}
        <span className="font-semibold text-amber-700 dark:text-amber-300">
          6 · {labels.secondStreak}
        </span>
        {' · '}
        <span className="font-semibold text-[#9a0d18]">
          10 · {labels.finalStreak}
        </span>
        {' · '}
        ≥67%
      </p>

      {rows.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{labels.person}</th>
                <th className="px-3 py-2 font-medium">{labels.project}</th>
                <th className="px-3 py-2 font-medium tabular-nums">{labels.misses}</th>
                <th className="px-3 py-2 font-medium">{labels.progress}</th>
                <th className="px-3 py-2 font-medium">{labels.status}</th>
                <th className="px-3 py-2 font-medium">{labels.next}</th>
                <th className="px-3 py-2 font-medium">{labels.started}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.creatorId} className="border-b border-border/70 last:border-0">
                  <td className="px-3 py-2.5 font-medium">
                    <Link
                      href={adminPersonHref(row.creatorId, {
                        panel: 'streaks',
                        projectId,
                        from: 'streaks',
                      })}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.projectName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">
                    {row.missCount}
                    <span className="font-normal text-muted-foreground"> / 10</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <MissBar count={row.missCount} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${phaseTone(row.phase)}`}
                    >
                      {labels[PHASE_LABEL[row.phase]]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.missesToNext != null && row.nextThreshold != null
                      ? `${row.missesToNext} → ${
                          row.nextThreshold === 3
                            ? labels.firstStreak
                            : row.nextThreshold === 6
                              ? labels.secondStreak
                              : labels.finalStreak
                        }`
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {row.probationStartedOn.slice(5)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {row.pendingNoticeId ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void copyArabic(row)}
                            className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                          >
                            {copiedId === row.pendingNoticeId
                              ? labels.copied
                              : labels.copyArabic}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(() => {
                                void markProbationNoticeMessagedAction(
                                  row.pendingNoticeId!,
                                ).then(() => keepPanel())
                              })
                            }
                            className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                          >
                            {labels.markSent}
                          </button>
                        </>
                      ) : null}
                      {!row.paused ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(() => {
                              void setCreatorFitnessTierAction(
                                row.creatorId,
                                null,
                              ).then(() => router.refresh())
                            })
                          }
                          className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'sky' | 'amber' | 'rose'
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-500/25 bg-sky-500/5'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-500/5'
        : tone === 'rose'
          ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-border bg-card'
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function MissBar({ count }: { count: number }) {
  const filled = Math.max(0, Math.min(10, count))
  return (
    <div className="flex items-center gap-0.5" aria-label={`${filled} of 10 miss days`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2.5 rounded-sm ${
            i < filled
              ? i >= 9
                ? 'bg-[#9a0d18]'
                : i >= 5
                  ? 'bg-amber-500'
                  : 'bg-sky-600'
              : 'bg-muted'
          }`}
        />
      ))}
    </div>
  )
}
