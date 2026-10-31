'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { extendContractForward } from '@/app/actions/admin'

const DAY_OPTIONS = [3, 7, 14] as const

export function PushContractForward({
  creatorId,
  contractId,
  contractEnd,
  compact = false,
  labels,
}: {
  creatorId: number
  contractId: number
  contractEnd: string | null
  compact?: boolean
  labels: {
    moreTime: string
    hint: string
    pushing: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (!contractEnd) return null

  function push(days: number) {
    startTransition(async () => {
      await extendContractForward(creatorId, contractId, days)
      router.refresh()
    })
  }

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1' : 'mt-2 flex flex-col gap-1'}>
      {!compact ? (
        <p className="text-[11px] text-muted-foreground">{labels.hint}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {compact ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.moreTime}
          </span>
        ) : null}
        {DAY_OPTIONS.map((days) => (
          <button
            key={days}
            type="button"
            disabled={pending}
            onClick={() => push(days)}
            title={labels.hint}
            className="h-7 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-accent disabled:opacity-60"
          >
            {pending ? labels.pushing : `+${days}d`}
          </button>
        ))}
      </div>
    </div>
  )
}
