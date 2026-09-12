'use client'

import { useTransition } from 'react'
import { updateSubmissionProject } from '@/app/actions/admin'
import type { Project } from '@/lib/db'

export function ProjectCell({
  id,
  projectId,
  projects,
  noneLabel = 'No project',
}: {
  id: number
  projectId: number | null
  projects: Pick<Project, 'id' | 'name'>[]
  noneLabel?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <select
      value={projectId ?? ''}
      disabled={pending}
      aria-label="Change project"
      onChange={(e) => {
        const raw = e.target.value
        const next = raw === '' ? null : Number(raw)
        startTransition(() => updateSubmissionProject(id, next))
      }}
      className="h-8 max-w-[140px] rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <option value="">{noneLabel}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
