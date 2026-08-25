'use client'

import { dateRangePresets } from '@/lib/campaign'

export function DateRangePresets({
  today,
  from,
  to,
  onSelect,
}: {
  today: string
  from: string
  to: string
  onSelect: (nextFrom: string, nextTo: string) => void
}) {
  const presets = dateRangePresets(today)

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => {
        const active = from === p.from && to === p.to
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.from, p.to)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
