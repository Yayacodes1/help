'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Creator } from '@/lib/db'
import { DateRangePresets } from '@/components/admin/date-range-presets'

export function FiltersBar({
  creators,
  today,
  defaultFrom,
  defaultTo,
}: {
  creators: Creator[]
  today: string
  defaultFrom: string
  defaultTo: string
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
    router.push(`/admin?${next.toString()}`)
  }

  function setRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString())
    if (nextFrom) next.set('from', nextFrom)
    else next.delete('from')
    if (nextTo) next.set('to', nextTo)
    else next.delete('to')
    next.set('panel', 'videos')
    router.push(`/admin?${next.toString()}`)
  }

  // Clearing keeps the selected project (owned by the top-level selector).
  function clearFilters() {
    const next = new URLSearchParams()
    const project = params.get('project')
    if (project) next.set('project', project)
    next.set('panel', 'videos')
    router.push(`/admin?${next.toString()}`)
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
