'use client'

import { useTransition } from 'react'
import { addStrike, removeStrike } from '@/app/actions/admin'
import { formatDate } from '@/lib/format'
import type { CreatorStrike } from '@/lib/db'

export function StrikesManager({
  creatorId,
  today,
  strikes,
  labels,
}: {
  creatorId: number
  today: string
  strikes: CreatorStrike[]
  labels: {
    title: string
    hint: string
    date: string
    reason: string
    add: string
    remove: string
    empty: string
    auto: string
    manual: string
  }
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{labels.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{labels.hint}</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-4"
        action={(fd) => startTransition(() => addStrike(creatorId, fd))}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.date}
          <input
            type="date"
            name="strike_date"
            required
            defaultValue={today}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          {labels.reason}
          <input
            name="reason"
            placeholder={labels.reason}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? '…' : labels.add}
        </button>
      </form>

      {strikes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {strikes.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{formatDate(row.strike_date)}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {row.source === 'manual' ? labels.manual : labels.auto}
                </span>
                {row.reason ? (
                  <span className="text-muted-foreground"> · {row.reason}</span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => removeStrike(row.id, creatorId))}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
              >
                {labels.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
