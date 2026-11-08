'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  clearAllProbationCreators,
  markProbationNoticeMessagedAction,
  resetCreatorStreakAction,
} from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { PanelProjectFilter } from '@/components/admin/panel-project-filter'
import {
  buildProbationStreakMessage,
  type DayPostStatus,
  type ProbationStreakBoard,
  type ProbationStreakRow,
} from '@/lib/probation-copy'

type Labels = {
  hint: string
  allProjects: string
  chooseProject: string
  person: string
  project: string
  empty: string
  clearAll: string
  clearAllConfirm: string
  reset: string
  resetConfirm: string
  copyArabic: string
  copied: string
  markSent: string
  firstStreak: string
  secondStreak: string
  finalStreak: string
  pickDay: string
  posted: string
  missed: string
  onBreak: string
  offDay: string
  onStreak: string
  clean: string
  missDays: string
  showMissed: string
  showPosted: string
  showStreaks: string
  showAll: string
}

function weekdayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`))
  } catch {
    return iso.slice(5)
  }
}

function shortDate(iso: string): string {
  return iso.slice(5)
}

function streakBadge(level: number, labels: Labels): { text: string; className: string } {
  if (level >= 3) {
    return {
      text: labels.finalStreak,
      className: 'border-[#9a0d18]/40 bg-[#9a0d18]/10 text-[#9a0d18]',
    }
  }
  if (level === 2) {
    return {
      text: labels.secondStreak,
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    }
  }
  if (level === 1) {
    return {
      text: labels.firstStreak,
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100',
    }
  }
  return {
    text: labels.clean,
    className: 'border-border bg-muted/40 text-muted-foreground',
  }
}

function dayStatusLabel(status: DayPostStatus, labels: Labels): string {
  if (status === 'posted') return labels.posted
  if (status === 'missed') return labels.missed
  if (status === 'break') return labels.onBreak
  return labels.offDay
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
  const [view, setView] = useState<'missed' | 'posted' | 'streaks' | 'all'>('missed')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'streaks')
    next.set('tab', 'people')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const rows = useMemo(() => {
    if (view === 'missed') return board.rows.filter((r) => r.dayStatus === 'missed')
    if (view === 'posted') return board.rows.filter((r) => r.dayStatus === 'posted')
    if (view === 'streaks') return board.rows.filter((r) => r.missCount > 0)
    return board.rows
  }, [board.rows, view])

  async function copyArabic(row: ProbationStreakRow) {
    if (!row.pendingNoticeId || !row.pendingLevel) return
    const text = buildProbationStreakMessage({
      id: row.pendingNoticeId,
      creatorId: row.creatorId,
      name: row.name,
      level: row.pendingLevel,
      unlockedOn: row.missDates[row.pendingLevel - 1] ?? board.today,
      missDates: row.missDates.slice(-3),
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

      {/* Day picker */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {labels.pickDay}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[...board.dayOptions].reverse().map((d) => {
            const on = d === board.selectedDay
            const isToday = d === board.today
            return (
              <button
                key={d}
                type="button"
                onClick={() => push({ streakDay: d })}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <div className="text-xs font-semibold">{weekdayLabel(d)}</div>
                <div className={`text-[10px] tabular-nums ${on ? 'opacity-90' : 'text-muted-foreground'}`}>
                  {shortDate(d)}
                  {isToday ? ' · today' : ''}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Day summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={`${labels.missed} · ${weekdayLabel(board.selectedDay)}`}
          value={board.counts.missedOnDay}
          tone="rose"
          active={view === 'missed'}
          onClick={() => setView('missed')}
        />
        <Stat
          label={labels.posted}
          value={board.counts.postedOnDay}
          tone="emerald"
          active={view === 'posted'}
          onClick={() => setView('posted')}
        />
        <Stat
          label={labels.onStreak}
          value={board.counts.total}
          tone="amber"
          active={view === 'streaks'}
          onClick={() => setView('streaks')}
        />
        <Stat
          label={`${labels.firstStreak} / ${labels.secondStreak} / ${labels.finalStreak}`}
          valueLabel={`${board.counts.first} · ${board.counts.second} · ${board.counts.final}`}
          tone="sky"
          active={view === 'all'}
          onClick={() => setView('all')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {(
            [
              ['missed', labels.showMissed],
              ['posted', labels.showPosted],
              ['streaks', labels.showStreaks],
              ['all', labels.showAll],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(labels.clearAllConfirm)) return
            startTransition(() => {
              void clearAllProbationCreators(projectId ?? null).then(() => router.refresh())
            })
          }}
          className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {labels.clearAll}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => {
            const badge = streakBadge(row.streakLevel, labels)
            return (
              <li
                key={row.creatorId}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={adminPersonHref(row.creatorId, {
                        panel: 'streaks',
                        projectId,
                        from: 'streaks',
                      })}
                      className="font-semibold hover:underline"
                    >
                      {row.name}
                    </Link>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                        row.dayStatus === 'missed'
                          ? 'border-rose-500/40 bg-rose-500/10 text-[#9a0d18]'
                          : row.dayStatus === 'posted'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                            : 'border-border bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {dayStatusLabel(row.dayStatus, labels)}
                    </span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                      {badge.text}
                      {row.streakLevel > 0 ? ` · ${row.missCount}/3` : ''}
                    </span>
                    {row.projectName ? (
                      <span className="text-[11px] text-muted-foreground">{row.projectName}</span>
                    ) : null}
                  </div>
                  {row.allMissDates.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {labels.missDays}
                      </span>
                      {row.allMissDates.map((d) => (
                        <span
                          key={d}
                          className={`rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${
                            d === board.selectedDay
                              ? 'border-rose-500/50 bg-rose-500/15 font-semibold text-[#9a0d18]'
                              : 'border-border bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          {shortDate(d)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {row.pendingNoticeId ? (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void copyArabic(row)}
                        className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                      >
                        {copiedId === row.pendingNoticeId ? labels.copied : labels.copyArabic}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(() => {
                            void markProbationNoticeMessagedAction(row.pendingNoticeId!).then(() =>
                              router.refresh(),
                            )
                          })
                        }
                        className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
                      >
                        {labels.markSent}
                      </button>
                    </>
                  ) : null}
                  {(row.missCount > 0 || row.allMissDates.length > 0) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(labels.resetConfirm.replace('{name}', row.name))) return
                        startTransition(() => {
                          void resetCreatorStreakAction(row.creatorId).then(() => router.refresh())
                        })
                      }}
                      className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
                    >
                      {labels.reset}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  valueLabel,
  tone,
  active,
  onClick,
}: {
  label: string
  value?: number
  valueLabel?: string
  tone?: 'sky' | 'amber' | 'rose' | 'emerald'
  active?: boolean
  onClick?: () => void
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-500/25 bg-sky-500/5'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-500/5'
        : tone === 'rose'
          ? 'border-rose-500/30 bg-rose-500/5'
          : tone === 'emerald'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-border bg-card'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-shadow ${toneClass} ${
        active ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
      }`}
    >
      <div className="text-xl font-semibold tabular-nums">
        {valueLabel ?? value ?? 0}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </button>
  )
}
