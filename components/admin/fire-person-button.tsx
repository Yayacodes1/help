'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserX, Play } from 'lucide-react'
import { pauseCreator, resumeCreator } from '@/app/actions/admin'

export function FirePersonButton({
  creatorId,
  name,
  fired,
  labels,
  redirectTo,
  size = 'md',
}: {
  creatorId: number
  name: string
  fired: boolean
  labels: {
    fire: string
    fireConfirm: string
    bringBack: string
    firedBadge: string
  }
  /** After firing, go here (e.g. back to Person period). */
  redirectTo?: string | null
  size?: 'sm' | 'md'
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm'

  if (fired) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[#9a0d18]/30 bg-[#9a0d18]/10 px-2 py-1 text-xs font-semibold text-[#9a0d18] dark:text-rose-300">
          {labels.firedBadge}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await resumeCreator(creatorId)
              router.refresh()
            })
          }
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-background font-semibold hover:bg-accent disabled:opacity-60 ${pad}`}
        >
          <Play className="size-3.5" />
          {labels.bringBack}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(labels.fireConfirm.replace('{name}', name))) return
        startTransition(async () => {
          await pauseCreator(creatorId)
          if (redirectTo) router.push(redirectTo)
          else router.refresh()
        })
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[#9a0d18]/40 bg-[#9a0d18]/10 font-semibold text-[#9a0d18] hover:bg-[#9a0d18]/15 disabled:opacity-60 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-300 ${pad}`}
      title={labels.fire}
    >
      <UserX className="size-3.5" />
      {labels.fire}
    </button>
  )
}
