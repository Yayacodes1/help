'use client'

import { useState, useTransition } from 'react'
import { requestTeamBreak } from '@/app/actions/leader'
import type { BreakRequest } from '@/lib/break-requests'
import { formatDate } from '@/lib/format'

type Person = { id: number; name: string; role: string; paused: boolean }

export function BreakRequestForm({
  today,
  people,
  requests,
  labels,
}: {
  today: string
  people: Person[]
  requests: BreakRequest[]
  labels: {
    hint: string
    person: string
    start: string
    days: string
    reason: string
    reasonPh: string
    send: string
    empty: string
    pending: string
    approved: string
    denied: string
    creator: string
    reposter: string
  }
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const active = people.filter((p) => !p.paused)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <form
        className="grid gap-2 sm:grid-cols-2"
        action={(fd) => {
          setMessage(null)
          startTransition(async () => {
            const res = await requestTeamBreak(fd)
            setMessage(res.ok ? 'Sent.' : res.error)
          })
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          {labels.person}
          <select
            name="creator_id"
            required
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">—</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.role === 'reposter' ? labels.reposter : labels.creator}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.start}
          <input
            type="date"
            name="start_date"
            required
            defaultValue={today}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.days}
          <input
            type="number"
            name="days"
            min={1}
            max={90}
            defaultValue={2}
            required
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          {labels.reason}
          <input
            name="reason"
            placeholder={labels.reasonPh}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || active.length === 0}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
        >
          {pending ? '…' : labels.send}
        </button>
        {message ? <p className="text-xs text-muted-foreground sm:col-span-2">{message}</p> : null}
      </form>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {requests.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {row.creator_name}
                  <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {row.creator_role === 'reposter' ? labels.reposter : labels.creator}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(row.start_date)} → {formatDate(row.end_date)}
                  {row.reason ? ` · ${row.reason}` : ''}
                </p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.status === 'approved'
                  ? labels.approved
                  : row.status === 'denied'
                    ? labels.denied
                    : labels.pending}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
