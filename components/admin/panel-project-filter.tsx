'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { sortProjects } from '@/lib/project-order'

type ProjectOption = { id: number; name: string }

/**
 * Shared Miqat / Notek / All chips for admin panels.
 * Updates the global `?project=` filter so every panel stays in sync.
 */
export function PanelProjectFilter({
  projects,
  projectId,
  panel,
  labels,
  promptWhenAll = false,
}: {
  projects: ProjectOption[]
  projectId?: number | null
  /** Keep the opened panel in the URL when changing project. */
  panel?: string | null
  labels: {
    allProjects: string
    chooseProject?: string
  }
  /** When header is "all projects", nudge the admin to pick one. */
  promptWhenAll?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const ordered = sortProjects(projects)
  const selected =
    projectId != null && Number.isFinite(projectId) ? projectId : null

  function push(nextProject: number | null) {
    const next = new URLSearchParams(params.toString())
    if (nextProject == null) next.delete('project')
    else next.set('project', String(nextProject))
    if (panel) next.set('panel', panel)
    // Choosing Miqat while stuck on Creators hides every post (all Miqat
    // activity is currently from reposters). Flip to All people.
    const name = ordered.find((p) => p.id === nextProject)?.name ?? ''
    const isMiqat = /miq|miy/i.test(name)
    const role = params.get('role')
    if (isMiqat && (!role || role === 'creator')) {
      next.set('role', 'all')
    }
    next.delete('creator')
    next.delete('aCreator')
    next.delete('pvPerson')
    router.push(`/admin?${next.toString()}`)
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`

  return (
    <div className="flex flex-col gap-2">
      {promptWhenAll && selected == null && labels.chooseProject ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {labels.chooseProject}
        </p>
      ) : null}
      <div
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
        role="group"
        aria-label={labels.allProjects}
      >
        {ordered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => push(p.id)}
            className={toggleClass(selected === p.id)}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => push(null)}
          className={toggleClass(selected == null)}
        >
          {labels.allProjects}
        </button>
      </div>
    </div>
  )
}
