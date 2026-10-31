'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { extendContractForward } from '@/app/actions/admin'

const DAY_OPTIONS = [3, 7, 14] as const
const MAX_DAYS = 60

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
    custom: string
    add: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [custom, setCustom] = useState('')
  if (!contractEnd) return null

  function push(days: number) {
    startTransition(async () => {
      await extendContractForward(creatorId, contractId, days)
      router.refresh()
    })
  }

  function pushCustom() {
    const n = Math.floor(Number(custom))
    if (!Number.isFinite(n) || n < 1 || n > MAX_DAYS) return
    push(n)
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
        <input
          type="number"
          min={1}
          max={MAX_DAYS}
          inputMode="numeric"
          placeholder={labels.custom}
          value={custom}
          disabled={pending}
          aria-label={labels.custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              pushCustom()
            }
          }}
          className="h-7 w-16 rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold tabular-nums"
        />
        <button
          type="button"
          disabled={pending}
          onClick={pushCustom}
          className="h-7 rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-accent disabled:opacity-60"
        >
          {pending ? labels.pushing : labels.add}
        </button>
      </div>
    </div>
  )
}
