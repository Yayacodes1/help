'use client'

import { useTransition, useState } from 'react'
import type { ScheduleBreak } from '@/lib/db'
import { createScheduleBreak, deleteScheduleBreak } from '@/app/actions/admin'
import { formatDate } from '@/lib/format'
import { addDays } from '@/lib/campaign'

export function BreaksManager({
  creatorId,
  today,
  breaks,
}: {
  creatorId: number
  today: string
  breaks: ScheduleBreak[]
}) {
  const [pending, startTransition] = useTransition()
  const [start, setStart] = useState(today)
  const [days, setDays] = useState(1)
  const endPreview = days >= 1 ? addDays(start, days - 1) : start

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Break / rest days</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Break and rest are the same: those days do not count as misses and do not add
        strikes. If the current contract has an end date, it is extended by the length of
        the break.
      </p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-4"
        action={(fd) => startTransition(() => createScheduleBreak(creatorId, fd))}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            name="start_date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value || today)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Days
          <input
            type="number"
            name="days"
            min={1}
            max={90}
            required
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Through (auto)
          <input
            type="date"
            name="end_date"
            value={endPreview}
            readOnly
            className="h-10 rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-4">
          Reason (optional)
          <input
            name="reason"
            placeholder="Break / rest, vacation, illness…"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-4"
        >
          {pending ? 'Saving…' : 'Add break / rest'}
        </button>
      </form>

      {breaks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No breaks scheduled.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {breaks.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-medium">
                  {formatDate(row.start_date)} → {formatDate(row.end_date)}
                </span>
                {row.reason ? (
                  <span className="text-muted-foreground"> · {row.reason}</span>
                ) : null}
                {row.days_added > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    Contract extended by {row.days_added} day{row.days_added === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(() => deleteScheduleBreak(row.id, creatorId))
                }
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
