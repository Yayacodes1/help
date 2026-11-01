'use client'

import { useState, type ReactNode } from 'react'

export function TimelineRoleSwitch({
  initial,
  labels,
  creators,
  reposters,
}: {
  initial: 'creator' | 'reposter'
  labels: { creators: string; reposters: string }
  creators: ReactNode
  reposters: ReactNode
}) {
  const [role, setRole] = useState<'creator' | 'reposter'>(initial)
  const options = [
    ['creator', labels.creators],
    ['reposter', labels.reposters],
  ] as const

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={`${labels.creators} / ${labels.reposters}`}
        className="inline-flex h-10 w-fit items-center gap-1 rounded-lg border border-input bg-background p-1"
      >
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRole(value)}
            className={`h-full rounded-md px-3 text-sm font-medium transition-colors ${
              role === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {role === 'creator' ? creators : reposters}
    </div>
  )
}
