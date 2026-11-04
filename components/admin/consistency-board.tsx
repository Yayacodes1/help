'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { adminPersonHref } from '@/lib/admin-href'
import type { DayStatus } from '@/lib/consistency'
import type { AdminConsistencyBoard } from '@/lib/admin-consistency'
import { PanelProjectFilter } from '@/components/admin/panel-project-filter'
import { projectToneClass } from '@/lib/project-scope'

const DAY_CLASS: Record<DayStatus, string> = {
  hit: 'bg-emerald-500/90',
  partial: 'bg-amber-400/90',
  miss: 'bg-rose-500/80',
  none: 'bg-muted',
  future: 'border border-dashed border-border',
  break: 'bg-sky-400/90',
}

const TARGET = 0.67

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function AdminConsistencyBoardPanel({
  board,
  projects,
  projectId,
  labels,
}: {
  board: AdminConsistencyBoard
  projects: Array<{ id: number; name: string }>
  projectId?: number | null
  labels: {
    hint: string
    empty: string
    search: string
    people: string
    hitRate: string
    currentStreak: string
    bestStreak: string
    missed: string
    partial: string
    lastDays: string
    posted: string
    break: string
    off: string
    noContract: string
    allProjects: string
    chooseProject: string
    creators: string
    reposters: string
    belowTarget: string
    target: string
  }
}) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return board.rows
    return board.rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.projectName?.toLowerCase().includes(needle) ?? false) ||
        (r.contractName?.toLowerCase().includes(needle) ?? false),
    )
  }, [board.rows, q])

  const below = board.rows.filter((r) => r.hitRate < TARGET).length

  return (
    <div className="flex flex-col gap-4">
      <PanelProjectFilter
        projects={projects}
        projectId={projectId}
        panel="consistency"
        labels={{
          allProjects: labels.allProjects,
          chooseProject: labels.chooseProject,
        }}
      />

      <p className="text-sm text-muted-foreground">{labels.hint}</p>
      <p className="text-xs text-muted-foreground">
        {labels.target}
        {below > 0 ? (
          <>
            {' · '}
            <span className="font-medium text-[#9a0d18] dark:text-rose-300">
              {below} {labels.belowTarget}
            </span>
          </>
        ) : null}
      </p>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(
          [
            ['hit', labels.posted],
            ['partial', labels.partial],
            ['miss', labels.missed],
            ['break', labels.break],
            ['none', labels.off],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${DAY_CLASS[status]}`} />
            {label}
          </span>
        ))}
      </div>

      <label className="relative w-fit">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.search}
          className="h-9 w-56 rounded-lg border border-input bg-background pl-8 pr-2 text-sm"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">{labels.people}</th>
                <th className="px-3 py-2 text-center font-medium">{labels.hitRate}</th>
                <th className="px-3 py-2 text-center font-medium">{labels.currentStreak}</th>
                <th className="px-3 py-2 text-center font-medium">{labels.bestStreak}</th>
                <th className="px-3 py-2 text-center font-medium">
                  {labels.missed} / {labels.partial}
                </th>
                <th className="px-3 py-2 text-start font-medium">{labels.lastDays}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const weak = row.hitRate < TARGET
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border last:border-0 ${weak ? 'bg-rose-500/5' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={adminPersonHref(row.id, {
                            panel: 'consistency',
                            from: 'consistency',
                          })}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {row.role === 'reposter' ? labels.reposters : labels.creators}
                        </span>
                        {row.projectName ? (
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${projectToneClass(row.projectName)}`}
                          >
                            {row.projectName}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.contractName ?? labels.noContract}
                      </p>
                    </td>
                    <td
                      className={`px-3 py-2 text-center font-semibold tabular-nums ${
                        weak ? 'text-[#9a0d18] dark:text-rose-300' : ''
                      }`}
                    >
                      {pct(row.hitRate)}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{row.currentStreak}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{row.bestStreak}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                      {row.missDays} / {row.partialDays}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5" dir="ltr">
                        {row.recent.map((d) => (
                          <span
                            key={d.date}
                            title={`${d.date} · IG ${d.instagram}/${d.goalInstagram} · TT ${d.tiktok}/${d.goalTiktok}`}
                            className={`inline-block size-3.5 rounded-sm ${DAY_CLASS[d.status]}`}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
