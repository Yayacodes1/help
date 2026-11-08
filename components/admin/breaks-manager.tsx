'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ScheduleBreak } from '@/lib/db'
import { createScheduleBreak, deleteScheduleBreak } from '@/app/actions/admin'
import { formatDate } from '@/lib/format'
import { addDays, calendarMonthRange } from '@/lib/campaign'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthLabel(ym: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${ym}-01T12:00:00Z`))
  } catch {
    return ym
  }
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function daysInMonth(ym: string): string[] {
  const { start, end } = calendarMonthRange(ym)
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

function inclusiveCount(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

function inRange(iso: string, start: string | null, end: string | null): boolean {
  if (!start) return false
  if (!end) return iso === start
  const lo = start <= end ? start : end
  const hi = start <= end ? end : start
  return iso >= lo && iso <= hi
}

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
  const [month, setMonth] = useState(today.slice(0, 7))
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const days = useMemo(() => daysInMonth(month), [month])
  const firstDow = useMemo(() => new Date(`${month}-01T12:00:00Z`).getUTCDay(), [month])

  const selectedStart =
    rangeStart && rangeEnd
      ? rangeStart <= rangeEnd
        ? rangeStart
        : rangeEnd
      : rangeStart
  const selectedEnd =
    rangeStart && rangeEnd
      ? rangeStart <= rangeEnd
        ? rangeEnd
        : rangeStart
      : rangeStart
  const dayCount =
    selectedStart && selectedEnd ? inclusiveCount(selectedStart, selectedEnd) : 0

  function pickDay(iso: string) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(iso)
      setRangeEnd(null)
      return
    }
    setRangeEnd(iso)
  }

  function clearSelection() {
    setRangeStart(null)
    setRangeEnd(null)
  }

  const existingBreakDays = useMemo(() => {
    const set = new Set<string>()
    for (const row of breaks) {
      let cur = row.start_date
      while (cur <= row.end_date) {
        set.add(cur)
        cur = addDays(cur, 1)
      }
    }
    return set
  }, [breaks])

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Give a break</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tap a start day, then an end day on the calendar. Those days are off (no miss / no
        streak), the contract end date grows by the same number of days, and they stay off
        Creator streaks until the break ends.
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
        >
          ←
        </button>
        <div className="text-sm font-semibold">{monthLabel(month)}</div>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((iso) => {
          const dayNum = Number(iso.slice(8, 10))
          const selected = inRange(iso, rangeStart, rangeEnd)
          const isEdge = iso === selectedStart || iso === selectedEnd
          const already = existingBreakDays.has(iso)
          const isToday = iso === today
          return (
            <button
              key={iso}
              type="button"
              onClick={() => pickDay(iso)}
              className={`flex h-10 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                selected
                  ? isEdge
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-primary/40 bg-primary/15 text-foreground'
                  : already
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100'
                    : isToday
                      ? 'border-border bg-muted/60 hover:bg-accent'
                      : 'border-transparent bg-muted/20 hover:bg-accent'
              }`}
              title={iso}
            >
              {dayNum}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {selectedStart ? (
          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 font-medium text-foreground">
            {formatDate(selectedStart)}
            {selectedEnd && selectedEnd !== selectedStart ? ` → ${formatDate(selectedEnd)}` : ''}
            {dayCount > 0 ? ` · ${dayCount} day${dayCount === 1 ? '' : 's'}` : ''}
          </span>
        ) : (
          <span>Tap the first day of the break, then the last day.</span>
        )}
        {rangeStart ? (
          <button
            type="button"
            onClick={clearSelection}
            className="underline-offset-4 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <form
        className="mt-3 flex flex-col gap-2"
        action={(fd) => {
          if (!selectedStart || !selectedEnd) return
          fd.set('start_date', selectedStart)
          fd.set('end_date', selectedEnd)
          fd.set('days', String(dayCount))
          startTransition(() => {
            void createScheduleBreak(creatorId, fd).then(() => {
              clearSelection()
              setReason('')
            })
          })
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reason (optional)
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rest, travel, illness…"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !selectedStart || !selectedEnd}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending
            ? 'Saving…'
            : selectedStart && selectedEnd
              ? `Give ${dayCount}-day break`
              : 'Select days on the calendar'}
        </button>
      </form>

      {breaks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No breaks scheduled.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {breaks.map((row) => {
            const active = row.start_date <= today && row.end_date >= today
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {formatDate(row.start_date)} → {formatDate(row.end_date)}
                  </span>
                  {active ? (
                    <span className="ml-2 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900 dark:text-sky-100">
                      On break now
                    </span>
                  ) : null}
                  {row.reason ? (
                    <span className="text-muted-foreground"> · {row.reason}</span>
                  ) : null}
                  {row.days_added > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      Contract extended by {row.days_added} day
                      {row.days_added === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      No contract end date to extend
                    </span>
                  )}
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
            )
          })}
        </ul>
      )}
    </div>
  )
}
