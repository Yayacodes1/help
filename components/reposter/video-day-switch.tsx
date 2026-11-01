'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function VideoDaySwitch({
  today,
  yesterday,
  selected,
  todayLabel,
  yesterdayLabel,
}: {
  today: string
  yesterday: string
  selected: string
  todayLabel: string
  yesterdayLabel: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function pick(day: string) {
    const next = new URLSearchParams(params.toString())
    next.set('videoDate', day)
    next.set('tab', 'today')
    next.set('panel', 'videos')
    next.delete('vPage')
    router.push(`?${next.toString()}`, { scroll: false })
  }

  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-card text-foreground hover:border-primary/40'
    }`

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={chip(selected === yesterday)} onClick={() => pick(yesterday)}>
        {yesterdayLabel}
      </button>
      <button type="button" className={chip(selected === today)} onClick={() => pick(today)}>
        {todayLabel}
      </button>
    </div>
  )
}
