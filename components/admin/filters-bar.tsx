'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Project, Creator } from '@/lib/db'

export function FiltersBar({
  projects,
  creators,
  defaultFrom,
  defaultTo,
}: {
  projects: Project[]
  creators: Creator[]
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/admin?${next.toString()}`)
  }

  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const hasFilters =
    params.get('project') ||
    params.get('creator') ||
    params.get('platform') ||
    params.get('from') ||
    params.get('to')

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">From</label>
        <input
          type="date"
          defaultValue={params.get('from') ?? defaultFrom}
          onChange={(e) => setParam('from', e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">To</label>
        <input
          type="date"
          defaultValue={params.get('to') ?? defaultTo}
          onChange={(e) => setParam('to', e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Project</label>
        <select
          defaultValue={params.get('project') ?? ''}
          onChange={(e) => setParam('project', e.target.value)}
          className={inputClass}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Creator</label>
        <select
          defaultValue={params.get('creator') ?? ''}
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
          defaultValue={params.get('platform') ?? ''}
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
          onClick={() => router.push('/admin')}
          className="h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
