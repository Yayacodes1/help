'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

  const yesterday = addDays(today, -1)
  const isToday = selectedDay === today
  const isYesterday = selectedDay === yesterday
  const isFuture = selectedDay >= today

  function goToDay(day: string) {
    const next = new URLSearchParams(params.toString())
    if (day === today) next.delete('day')
    else next.set('day', day)
    router.push(`/admin?${next.toString()}`)
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToDay(addDays(selectedDay, -1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          value={selectedDay}
          max={today}
          onChange={(e) => {
            if (e.target.value) goToDay(e.target.value)
          }}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => goToDay(addDays(selectedDay, 1))}
          disabled={isFuture}
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
