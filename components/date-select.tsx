'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'

export function DateSelect({
  date,
  min,
  max,
}: {
  date: string
  min: string
  max: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(value: string) {
    if (!value) return
    const next = new URLSearchParams(params.toString())
    next.set('date', value)
    router.push(`?${next.toString()}`)
  }

  return (
    <div className="relative inline-flex items-center">
      <CalendarDays className="pointer-events-none absolute right-3 h-4 w-4 text-primary" />
      <input
        type="date"
        value={date}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="h-11 rounded-xl border border-input bg-card pr-10 pl-3 text-sm font-medium shadow-sm outline-none transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="اختر التاريخ"
      />
    </div>
  )
}
