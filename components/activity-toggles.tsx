'use client'

import { useOptimistic, useTransition } from 'react'
import { setActivity } from '@/app/actions/activity'
import { ACTIVITY_KINDS, ACTIVITY_LABELS, type ActivityKind } from '@/lib/activity-kinds'

export function ActivityToggles({
  creatorId,
  day,
  marked,
}: {
  creatorId: number
  day: string
  marked: ActivityKind[]
}) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(marked, (current: ActivityKind[], next: { kind: ActivityKind; on: boolean }) =>
    next.on ? [...current, next.kind] : current.filter((k) => k !== next.kind),
  )

  return (
    <div className="flex flex-wrap gap-1">
      {ACTIVITY_KINDS.map((kind) => {
        const on = shown.includes(kind)
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() =>
              startTransition(async () => {
                setShown({ kind, on: !on })
                await setActivity({ creatorId, day, kind, on: !on })
              })
            }
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            {on ? '✓ ' : ''}
            {ACTIVITY_LABELS[kind]}
          </button>
        )
      })}
    </div>
  )
}

export function ActivityCountsLine({
  counts,
  className = 'text-xs text-muted-foreground',
}: {
  counts: Record<ActivityKind, number>
  className?: string
}) {
  const parts = ACTIVITY_KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${ACTIVITY_LABELS[kind]} ${counts[kind]}`)
  return <span className={className}>{parts.length > 0 ? parts.join(' · ') : 'Nothing ticked'}</span>
}
