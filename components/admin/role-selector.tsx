'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RoleFilter } from '@/lib/participant-role'

/** Creators (default) / Reposters / Both for the whole dashboard. */
export function RoleSelector({
  labels,
}: {
  labels: {
    creators: string
    reposters: string
    all: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const raw = params.get('role')
  const value: RoleFilter = raw === 'all' || raw === 'reposter' ? raw : 'creator'

  function onChange(nextValue: RoleFilter) {
    const next = new URLSearchParams(params.toString())
    if (nextValue === 'creator') next.delete('role')
    else next.set('role', nextValue)
    // Resets the per-project choices in the side-by-side columns too.
    for (const key of [...next.keys()]) {
      if (/^role\d+$/.test(key)) next.delete(key)
    }
    next.delete('aRole')
    next.delete('creator')
    next.delete('aCreator')
    startTransition(() => router.push(`/admin?${next.toString()}`, { scroll: false }))
  }

  const options: Array<[RoleFilter, string]> = [
    ['creator', labels.creators],
    ['reposter', labels.reposters],
    ['all', labels.all],
  ]

  return (
    <div
      role="group"
      aria-label="Show creators, reposters, or both"
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
