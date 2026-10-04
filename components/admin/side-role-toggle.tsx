'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RoleFilter } from '@/lib/participant-role'
import { sideRoleKey } from '@/lib/project-scope'

/** Creators & reposters / Creators / Reposters for one project column only. */
export function SideRoleToggle({
  projectId,
  value,
  labels,
}: {
  projectId: number
  value: RoleFilter
  labels: { all: string; creators: string; reposters: string }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function pick(next: RoleFilter) {
    const q = new URLSearchParams(params.toString())
    const dashboardRole = params.get('role') ?? 'all'
    if (next === dashboardRole) q.delete(sideRoleKey(projectId))
    else q.set(sideRoleKey(projectId), next)
    startTransition(() => router.push(`/admin?${q.toString()}`, { scroll: false }))
  }

  const options: Array<[RoleFilter, string]> = [
    ['all', labels.all],
    ['creator', labels.creators],
    ['reposter', labels.reposters],
  ]

  return (
    <div
      role="group"
      className={`inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      {options.map(([role, label]) => (
        <button
          key={role}
          type="button"
          onClick={() => pick(role)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === role
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
