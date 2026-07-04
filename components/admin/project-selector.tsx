'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { FolderKanban } from 'lucide-react'
import type { Project } from '@/lib/db'

export function ProjectSelector({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set('project', value)
    else next.delete('project')
    // Reset creator filter when switching projects so it stays consistent.
    next.delete('creator')
    router.push(`/admin?${next.toString()}`)
  }

  return (
    <div className="relative inline-flex items-center">
      <FolderKanban className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
      <select
        value={params.get('project') ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter dashboard by project"
        className="h-10 appearance-none rounded-lg border border-input bg-background pl-9 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}
