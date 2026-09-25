'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Creator, Project } from '@/lib/db'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { PanelProjectFilter } from '@/components/admin/panel-project-filter'

export function FiltersBar({
  creators,
  projects,
  projectId,
  today,
  defaultFrom,
  defaultTo,
  labels,
}: {
  creators: Creator[]
  projects: Pick<Project, 'id' | 'name'>[]
  projectId?: number | null
  today: string
  defaultFrom: string
  defaultTo: string
  labels: {
    allProjects: string
    chooseProject: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()

  const from = params.get('from') || defaultFrom
  const to = params.get('to') || defaultTo

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.set('panel', 'videos')
    router.push(`/admin?${next.toString()}`, { scroll: false })
  }

  function setRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString())
    if (nextFrom) next.set('from', nextFrom)
    else next.delete('from')
    if (nextTo) next.set('to', nextTo)
    else next.delete('to')
    next.set('panel', 'videos')
    router.push(`/admin?${next.toString()}`, { scroll: false })
  }

  // Clearing keeps the selected project and role (owned by the top-level selectors).
  function clearFilters() {
    const next = new URLSearchParams()
    const project = params.get('project')
    const role = params.get('role')
    if (project) next.set('project', project)
    if (role) next.set('role', role)
    next.set('panel', 'videos')
    router.push(`/admin?${next.toString()}`, { scroll: false })
  }

  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const hasFilters =
    params.get('creator') ||
    params.get('platform') ||
    params.get('from') ||
    params.get('to')

  return (
    <div className="flex flex-col gap-3">
      <PanelProjectFilter
        projects={projects}
        projectId={projectId}
        panel="videos"
        promptWhenAll
        labels={labels}
      />
      <DateRangePresets today={today} from={from} to={to} onSelect={setRange} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setParam('from', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setParam('to', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Creator</label>
          <select
            value={params.get('creator') ?? ''}
            onChange={(e) => setParam('creator', e.target.value)}
            className={inputClass}
          >
            <option value="">All creators</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Platform</label>
          <select
            value={params.get('platform') ?? ''}
            onChange={(e) => setParam('platform', e.target.value)}
            className={inputClass}
          >
            <option value="">All platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  )
}
