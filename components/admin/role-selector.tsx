'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Users } from 'lucide-react'
import type { RoleFilter } from '@/lib/participant-role'

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
  const current = (params.get('role') as RoleFilter | null) ?? 'creator'
  const value =
    current === 'reposter' || current === 'all' || current === 'creator'
      ? current
      : 'creator'

  function onChange(nextValue: string) {
    const next = new URLSearchParams(params.toString())
    if (nextValue === 'creator') next.delete('role')
    else next.set('role', nextValue)
    // Reset creator filter when switching role so it stays consistent.
    next.delete('creator')
    next.delete('aCreator')
    router.push(`/admin?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="relative inline-flex items-center">
      <Users className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter dashboard by creators or reposters"
        className="h-10 appearance-none rounded-lg border border-input bg-background pl-9 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="creator">{labels.creators}</option>
        <option value="reposter">{labels.reposters}</option>
        <option value="all">{labels.all}</option>
      </select>
    </div>
  )
}
