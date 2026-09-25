'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { addDays } from '@/lib/campaign'

export function DayNavigator({
  selectedDay,
  today,
}: {
  selectedDay: string
  today: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const yesterday = addDays(today, -1)
  const isToday = selectedDay === today
  const isYesterday = selectedDay === yesterday
  const isFuture = selectedDay >= today

  function goToDay(day: string) {
    const next = new URLSearchParams(params.toString())
    if (day === today) next.delete('day')
    else next.set('day', day)
    startTransition(() => {
      router.push(`/admin?${next.toString()}`, { scroll: false })
    })
  }

  const label = new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  const quickBtn =
    'h-9 rounded-lg border px-3 text-sm font-medium transition-colors'

  return (
    <div className="relative flex flex-wrap items-center gap-3">
      {pending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" />
            Loading…
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToDay(addDays(selectedDay, -1))}
          disabled={pending}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          value={selectedDay}
          max={today}
          disabled={pending}
          onChange={(e) => {
            if (e.target.value) goToDay(e.target.value)
          }}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => goToDay(addDays(selectedDay, 1))}
          disabled={isFuture || pending}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToDay(today)}
          disabled={pending}
          className={`${quickBtn} ${
            isToday
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => goToDay(yesterday)}
          disabled={pending}
          className={`${quickBtn} ${
            isYesterday
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          }`}
        >
          Yesterday
        </button>
      </div>

      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
