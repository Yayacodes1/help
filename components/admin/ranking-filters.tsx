'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { shiftYearMonth } from '@/lib/biweekly'
import type { RoleFilter } from '@/lib/participant-role'
import { sortProjects } from '@/lib/project-order'

export function RankingFilters({
  today,
  month,
  projectId,
  role,
  projects,
  labels,
}: {
  today: string
  month: string
  projectId: number | null
  role: RoleFilter
  projects: Array<{ id: number; name: string }>
  labels: {
    thisMonth: string
    lastMonth: string
    month: string
    allProjects: string
    creators: string
    reposters: string
    all: string
    kind: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const currentMonth = today.slice(0, 7)
  const orderedProjects = sortProjects(projects)

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'ranking')
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin?${next.toString()}`)
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => push({ rankMonth: null })}
          className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
            month === currentMonth
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          }`}
        >
          {labels.thisMonth}
        </button>
        <button
          type="button"
          onClick={() => push({ rankMonth: shiftYearMonth(currentMonth, -1) })}
          className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
            month === shiftYearMonth(currentMonth, -1)
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          }`}
        >
          {labels.lastMonth}
        </button>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-sm">
          <span className="text-xs text-muted-foreground">{labels.month}</span>
          <input
            type="month"
            value={month}
            max={currentMonth}
            onChange={(e) => {
              if (!e.target.value) return
              push({ rankMonth: e.target.value === currentMonth ? null : e.target.value })
            }}
            className="bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="group"
          aria-label={labels.allProjects}
        >
          {orderedProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => push({ project: String(p.id), rankProject: null })}
              className={toggleClass(projectId === p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => push({ project: null, rankProject: null })}
            className={toggleClass(projectId == null)}
          >
            {labels.allProjects}
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.kind}
          <select
            value={role}
            onChange={(e) => push({ rankRole: e.target.value === 'all' ? null : e.target.value })}
            className="h-9 min-w-40 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">{labels.all}</option>
            <option value="creator">{labels.creators}</option>
            <option value="reposter">{labels.reposters}</option>
          </select>
        </label>
      </div>
    </div>
  )
}
