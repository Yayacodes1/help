'use client'

import { useTransition } from 'react'
import type { ScheduleBreak } from '@/lib/db'
import { createScheduleBreak, deleteScheduleBreak } from '@/app/actions/admin'
import { formatDate } from '@/lib/format'

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

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Scheduled breaks</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Break days do not count as misses and do not break the streak. If the current contract has
        an end date, it is extended by the length of the break.
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
            defaultValue={today}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            name="end_date"
            required
            defaultValue={today}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Reason (optional)
          <input
            name="reason"
            placeholder="Vacation, illness…"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-4"
        >
          {pending ? 'Saving…' : 'Add break'}
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
