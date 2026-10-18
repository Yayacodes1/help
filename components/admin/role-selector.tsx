'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RoleFilter } from '@/lib/participant-role'

export type DashboardRole = RoleFilter | 'leaders'

/** Creators (default) / Reposters / Both / Leaders for the whole dashboard. */
export function RoleSelector({
  labels,
  defaultRole = 'creator',
  showLeaders = false,
}: {
  labels: {
    creators: string
    reposters: string
    all: string
    leaders?: string
  }
  /** What a missing `?role=` means on this page. */
  defaultRole?: RoleFilter
  showLeaders?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const raw = params.get('role')
  const value: DashboardRole =
    raw === 'leaders' && showLeaders
      ? 'leaders'
      : raw === 'all' || raw === 'reposter' || raw === 'creator'
        ? raw
        : defaultRole

  function onChange(nextValue: DashboardRole) {
    const next = new URLSearchParams(params.toString())
    if (nextValue === defaultRole) next.delete('role')
    else next.set('role', nextValue)
    // Resets the per-project choices in the side-by-side columns too.
    for (const key of [...next.keys()]) {
      if (/^role\d+$/.test(key)) next.delete(key)
    }
    next.delete('aRole')
    next.delete('creator')
    next.delete('aCreator')
    if (nextValue === 'leaders') {
      next.set('tab', 'today')
      next.set('panel', 'leaders')
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const options: Array<[DashboardRole, string]> = [
    ['creator', labels.creators],
    ['reposter', labels.reposters],
    ['all', labels.all],
    ...(showLeaders && labels.leaders ? [['leaders', labels.leaders] as [DashboardRole, string]] : []),
  ]

  return (
    <div
      role="group"
      aria-label="Show creators, reposters, both, or leaders"
      className={`inline-flex h-10 items-center gap-1 rounded-lg border border-input bg-background p-1 ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      {options.map(([role, label]) => (
        <button
          key={role}
          type="button"
          onClick={() => onChange(role)}
          className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
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
