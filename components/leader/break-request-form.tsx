'use client'

import { useState, useTransition } from 'react'
import { applyTeamBreakRequest, requestTeamBreak } from '@/app/actions/leader'
import type { BreakRequest } from '@/lib/break-requests'
import { formatDate } from '@/lib/format'

type Person = { id: number; name: string; role: string; paused: boolean }

export function BreakRequestForm({
  today,
  people,
  requests,
  defaultCreatorId,
  labels,
}: {
  today: string
  people: Person[]
  requests: BreakRequest[]
  defaultCreatorId?: number
  labels: {
    hint: string
    person: string
    kind: string
    kindBreak: string
    kindPause: string
    pauseHint: string
    start: string
    days: string
    reason: string
    reasonPh: string
    send: string
    empty: string
    pending: string
    approved: string
    denied: string
    giveBreak: string
    givePause: string
    waitingGive: string
    applied: string
    creator: string
    reposter: string
  }
}) {
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<'break' | 'pause'>('break')
  const [message, setMessage] = useState<string | null>(null)
  const active = people.filter((p) => !p.paused)
  const preset = defaultCreatorId != null && active.some((p) => p.id === defaultCreatorId) ? defaultCreatorId : undefined

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
        <input type="hidden" name="kind" value={kind} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          {labels.person}
          <select
            name="creator_id"
            required
            defaultValue={preset ?? ''}
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
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs text-muted-foreground">{labels.kind}</legend>
          <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-input bg-background p-1">
            <button
              type="button"
              onClick={() => setKind('break')}
              className={`h-full rounded-md px-3 text-sm font-medium ${
                kind === 'break' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {labels.kindBreak}
            </button>
            <button
              type="button"
              onClick={() => setKind('pause')}
              className={`h-full rounded-md px-3 text-sm font-medium ${
                kind === 'pause' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {labels.kindPause}
            </button>
          </div>
          {kind === 'pause' ? <p className="mt-1 text-xs text-muted-foreground">{labels.pauseHint}</p> : null}
        </fieldset>
        {kind === 'break' ? (
          <>
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
          </>
        ) : null}
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
          {requests.map((row) => {
            const canGive = row.status === 'approved' && !row.applied_at
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {row.creator_name}
                    <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {row.kind === 'pause' ? labels.kindPause : labels.kindBreak}
                      {' · '}
                      {row.creator_role === 'reposter' ? labels.reposter : labels.creator}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.kind === 'pause'
                      ? labels.kindPause
                      : `${formatDate(row.start_date)} → ${formatDate(row.end_date)}`}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </p>
                </div>
                {canGive ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setMessage(null)
                        const res = await applyTeamBreakRequest(row.id)
                        setMessage(res.ok ? null : res.error)
                      })
                    }
                    className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {row.kind === 'pause' ? labels.givePause : labels.giveBreak}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.status === 'approved'
                      ? row.applied_at
                        ? labels.applied
                        : labels.waitingGive
                      : row.status === 'denied'
                        ? labels.denied
                        : labels.pending}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
