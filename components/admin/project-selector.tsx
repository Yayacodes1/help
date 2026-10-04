'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { FolderKanban } from 'lucide-react'
import type { Project } from '@/lib/db'
import { SPLIT_PROJECT_VALUE, splitProjectPair } from '@/lib/project-scope'
import { sortProjects } from '@/lib/project-order'

export function ProjectSelector({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const ordered = sortProjects(projects)
  const pair = splitProjectPair(ordered)

  const projectParam = params.get('project')
  const current = projectParam && projectParam !== SPLIT_PROJECT_VALUE ? projectParam : ''

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set('project', value)
    else next.delete('project')
    // Reset person filters when switching projects so lists stay consistent.
    next.delete('creator')
    next.delete('aCreator')
    next.delete('aProject')
    next.delete('pvPerson')

    router.push(`/admin?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="relative inline-flex items-center">
      <FolderKanban className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter dashboard by project"
        className="h-10 appearance-none rounded-lg border border-input bg-background pl-9 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">
          {pair.length === 2 ? `All projects (${pair[0].name} | ${pair[1].name})` : 'All projects'}
        </option>
        {ordered.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}
