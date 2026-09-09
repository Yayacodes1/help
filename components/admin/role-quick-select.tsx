'use client'

import { useTransition } from 'react'
import type { ParticipantRole } from '@/lib/participant-role'
import { setCreatorRole } from '@/app/actions/admin'

export function RoleQuickSelect({
  creatorId,
  role,
  size = 'sm',
}: {
  creatorId: number
  role: ParticipantRole | string | null | undefined
  size?: 'sm' | 'md'
}) {
  const [pending, startTransition] = useTransition()
  const value: ParticipantRole = role === 'reposter' ? 'reposter' : 'creator'

  return (
    <select
      value={value}
      disabled={pending}
      aria-label="Change role"
      title="Change role"
      onChange={(e) => {
        const next = e.target.value
        if (next === value) return
        startTransition(() => setCreatorRole(creatorId, next))
      }}
      className={
        size === 'md'
          ? 'h-9 rounded-lg border border-input bg-background px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
          : 'h-7 rounded-md border border-input bg-secondary px-1.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
      }
    >
      <option value="creator">Creator</option>
      <option value="reposter">Reposter</option>
    </select>
  )
}
