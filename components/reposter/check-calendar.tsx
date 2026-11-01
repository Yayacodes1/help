'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { calendarMonthRange } from '@/lib/campaign'
import { shiftYearMonth } from '@/lib/biweekly'
import { formatWeekdayDate } from '@/lib/format'

function monthGrid(yearMonth: string): Array<{ date: string } | null> {
  const { start, end } = calendarMonthRange(yearMonth)
  const first = new Date(`${start}T00:00:00Z`).getUTCDay()
  const cells: Array<{ date: string } | null> = Array.from({ length: first }, () => null)
  for (let day = start; day <= end; day = nextDay(day)) cells.push({ date: day })
  return cells
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function CheckCalendar({
  day,
  today,
  counts,
  locale,
}: {
  day: string
  today: string
  counts: Record<string, number>
  locale: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const month = day.slice(0, 7)
  const cells = monthGrid(month)
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    locale === 'ar' ? 'ar' : 'en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  )

  function openDay(nextDayValue: string) {
    if (nextDayValue > today) return
    const next = new URLSearchParams(params.toString())
    next.set('checkDate', nextDayValue)
    next.set('tab', 'today')
    next.set('panel', 'check')
    router.push(`?${next.toString()}`, { scroll: false })
  }

  function shiftMonth(delta: number) {
    const target = shiftYearMonth(month, delta)
    const { end } = calendarMonthRange(target)
    const sameDay = `${target}-${day.slice(8, 10)}`
    const picked = sameDay <= end ? sameDay : end
    openDay(picked > today ? today : picked)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{formatWeekdayDate(day, locale)}</p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2 text-xs font-semibold hover:border-primary/40"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-xs font-medium text-muted-foreground">{monthName}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={month >= today.slice(0, 7)}
          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2 text-xs font-semibold hover:border-primary/40 disabled:opacity-40"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) return <span key={`empty-${index}`} />
          const selected = cell.date === day
          const future = cell.date > today
          const marked = (counts[cell.date] ?? 0) > 0
          return (
            <button
              key={cell.date}
              type="button"
              disabled={future}
              onClick={() => openDay(cell.date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md text-[10px] font-medium tabular-nums disabled:opacity-30 ${
                selected ? 'ring-2 ring-primary' : ''
              } ${
                marked
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {cell.date.slice(8, 10)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
