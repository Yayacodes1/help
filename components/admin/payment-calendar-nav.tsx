'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { shiftYearMonth } from '@/lib/biweekly'
import type { CalendarRoleFilter } from '@/lib/payment-calendar'

export function PaymentCalendarNav({
  month,
  todayMonth,
  role,
  labels,
}: {
  month: string
  todayMonth: string
  role: CalendarRoleFilter
  labels: {
    prev: string
    next: string
    today: string
    creators: string
    reposters: string
    both: string
  }
}) {
  const router = useRouter()
  const params = useSearchParams()

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('tab', 'money')
    next.set('panel', 'calendar')
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin?${next.toString()}`)
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
    }`

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => push({ calMonth: shiftYearMonth(month, -1) })} className="h-9 rounded-lg border border-border px-3 text-sm">
          {labels.prev}
        </button>
        <button
          type="button"
          onClick={() => push({ calMonth: todayMonth })}
          className={`h-9 rounded-lg border px-3 text-sm ${
            month === todayMonth ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
          }`}
        >
          {labels.today}
        </button>
        <button type="button" onClick={() => push({ calMonth: shiftYearMonth(month, 1) })} className="h-9 rounded-lg border border-border px-3 text-sm">
          {labels.next}
        </button>
      </div>
      <div className="inline-flex rounded-lg border border-border p-0.5">
        <button type="button" onClick={() => push({ calRole: 'creator' })} className={toggleClass(role === 'creator')}>
          {labels.creators}
        </button>
        <button type="button" onClick={() => push({ calRole: 'reposter' })} className={toggleClass(role === 'reposter')}>
          {labels.reposters}
        </button>
        <button type="button" onClick={() => push({ calRole: 'all' })} className={toggleClass(role === 'all')}>
          {labels.both}
        </button>
      </div>
    </div>
  )
}
