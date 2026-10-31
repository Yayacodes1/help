'use client'

import { useMemo, useState, useTransition } from 'react'
import { Pencil, Search, X } from 'lucide-react'
import { saveTimelineContract } from '@/app/actions/admin'
import type { CreatorTrackingRow } from '@/lib/queries'
import { personBelongsOnProjectManage } from '@/lib/project-scope'
import { participantRoleLabel } from '@/lib/participant-role'

export type TimelineLabels = {
  title: string
  hint: string
  start: string
  end: string
  pay: string
  payFifteen: string
  payUpfront: string
  payEnd: string
  noContract: string
  open: string
  save: string
  cancel: string
  empty: string
  paused: string
  saving: string
}

function timingLabel(
  timing: CreatorTrackingRow['pay_timing'],
  labels: TimelineLabels,
): string {
  if (timing === 'upfront') return labels.payUpfront
  if (timing === 'end') return labels.payEnd
  if (timing === 'fifteen') return labels.payFifteen
  return labels.noContract
}

function DateRange({
  start,
  end,
  openLabel,
}: {
  start: string | null
  end: string | null
  openLabel: string
}) {
  if (!start && !end) return <span>—</span>
  return (
    <span className="tabular-nums">
      {start ?? '—'}
      {' → '}
      {end ?? openLabel}
    </span>
  )
}

export function TimelineManage({
  people,
  pausedPeople = [],
  today,
  currentProjectId,
  labels,
}: {
  people: CreatorTrackingRow[]
  pausedPeople?: CreatorTrackingRow[]
  today: string
  currentProjectId?: number | string | null
  labels: TimelineLabels
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const scoped = useMemo(
    () => people.filter((c) => personBelongsOnProjectManage(c, currentProjectId)),
    [people, currentProjectId],
  )
  const scopedPaused = useMemo(
    () => pausedPeople.filter((c) => personBelongsOnProjectManage(c, currentProjectId)),
    [pausedPeople, currentProjectId],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const list = q
      ? scoped.filter((c) =>
          [
            c.name,
            c.tiktok_username,
            c.instagram_username,
            c.notek_tiktok_username,
            c.notek_instagram_username,
            c.miqat_tiktok_username,
            c.miqat_instagram_username,
          ].some((v) => v?.toLowerCase().includes(q)),
        )
      : scoped
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [scoped, query])

  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  function Editor({ person }: { person: CreatorTrackingRow }) {
    const timing =
      person.pay_timing === 'upfront' || person.pay_timing === 'end' || person.pay_timing === 'fifteen'
        ? person.pay_timing
        : 'fifteen'
    return (
      <form
        action={(fd) => {
          setError(null)
          startTransition(async () => {
            const result = await saveTimelineContract(fd)
            if (result && !result.ok) setError(result.message)
          })
        }}
        className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3"
      >
        <input type="hidden" name="creator_id" value={person.id} />
        {person.contract_id ? <input type="hidden" name="contract_id" value={person.contract_id} /> : null}
        <div className="font-medium">{person.name}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.start}
            <input
              type="date"
              name="start_date"
              required
              defaultValue={person.timeline_start ?? today}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.end}
            <input
              type="date"
              name="end_date"
              defaultValue={person.timeline_end ?? ''}
              className={inputClass}
            />
          </label>
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium text-foreground">{labels.pay}</legend>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="radio" name="pay_timing" value="fifteen" defaultChecked={timing === 'fifteen'} className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">{labels.payFifteen}</span>
              {' — '}
              first pay 15 days after start, last pay at the contract end.
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="radio" name="pay_timing" value="upfront" defaultChecked={timing === 'upfront'} className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">{labels.payUpfront}</span>
              {' — '}
              pay at the start, then every 2 weeks until the contract ends.
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="radio" name="pay_timing" value="end" defaultChecked={timing === 'end'} className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">{labels.payEnd}</span>
              {' — '}
              one payment on the last day of the contract.
            </span>
          </label>
        </fieldset>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? labels.saving : labels.save}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(null)
              setError(null)
            }}
            className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm"
          >
            <X className="size-4" />
            <span className="ml-1">{labels.cancel}</span>
          </button>
        </div>
      </form>
    )
  }

  function Row({ person }: { person: CreatorTrackingRow }) {
    if (editingId === person.id) return <Editor person={person} />
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{person.name}</span>
            <span className="text-[11px] text-muted-foreground">{participantRoleLabel(person.role)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {person.project_name ?? 'Both projects'}
            {' · '}
            <DateRange start={person.timeline_start} end={person.timeline_end} openLabel={labels.open} />
            {' · '}
            {timingLabel(person.pay_timing, labels)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(person.id)
            setError(null)
          }}
          className="rounded-md border border-border p-1.5 hover:bg-accent"
          title="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{labels.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{labels.hint}</p>
      <label className="relative mt-3 block min-w-48">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or @handle…"
          className="h-10 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {visible.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">
            {scoped.length === 0 ? labels.empty : 'No one matches that search.'}
          </li>
        ) : (
          visible.map((person) => (
            <li key={person.id} className="py-3">
              <Row person={person} />
            </li>
          ))
        )}
      </ul>
      {scopedPaused.length > 0 ? (
        <details className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            {labels.paused} ({scopedPaused.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {scopedPaused.map((person) => (
              <li key={person.id} className="py-3">
                <Row person={person} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
