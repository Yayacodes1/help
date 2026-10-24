'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'
import { restoreLastStreaks } from '@/app/actions/admin'

export function RestoreStreaksButton({
  creatorIds,
  labels,
  compact = false,
}: {
  creatorIds: number[]
  labels: {
    action: string
    hint?: string
    restoring: string
    restored: string
    none: string
  }
  compact?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [flash, setFlash] = useState<string | null>(null)
  const ids = creatorIds.filter((id) => Number.isFinite(id) && id > 0)
  if (ids.length === 0) return null

  return (
    <div className={compact ? 'inline-flex flex-col items-start gap-1' : 'flex flex-col gap-1'}>
      <button
        type="button"
        disabled={pending}
        title={labels.hint}
        onClick={() => {
          setFlash(null)
          startTransition(async () => {
            const result = await restoreLastStreaks(ids)
            if (result.restored > 0) {
              setFlash(`${labels.restored} ${result.restored}`)
            } else {
              setFlash(labels.none)
            }
          })
        }}
        className={
          compact
            ? 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent disabled:opacity-60'
            : 'inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60'
        }
      >
        <RotateCcw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? labels.restoring : labels.action}
      </button>
      {flash ? <p className="text-xs text-muted-foreground">{flash}</p> : null}
    </div>
  )
}
