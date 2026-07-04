'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronDown, CalendarDays } from 'lucide-react'

function labelFor(date: string, today: string, count: number): string {
  const day = Number(date.slice(8, 10))
  let base = `${day} يوليو`
  if (date === today) base = `${base} (اليوم)`
  if (count > 0) base = `${base} — ${count} فيديو`
  return base
}

export function DateSelect({
  date,
  dates,
  today,
  counts = {},
}: {
  date: string
  dates: string[]
  today: string
  counts?: Record<string, number>
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString())
    next.set('date', value)
    router.push(`?${next.toString()}`)
  }

  return (
    <div className="relative inline-flex items-center">
      <CalendarDays className="pointer-events-none absolute right-3 h-4 w-4 text-primary" />
      <select
        value={date}
        onChange={(e) => onChange(e.target.value)}
        dir="rtl"
        className="h-11 appearance-none rounded-xl border border-input bg-card pr-10 pl-9 text-sm font-medium shadow-sm outline-none transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="اختر التاريخ"
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {labelFor(d, today, counts[d] ?? 0)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
    </div>
  )
}
