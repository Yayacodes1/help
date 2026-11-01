'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, Pencil, Search, X } from 'lucide-react'
import {
  markContractDetailsDone,
  recordDueHalfPayment,
  saveTimelineContract,
  saveTimelineWaveAmounts,
  setCreatorUrgent,
} from '@/app/actions/admin'
import type { CreatorTrackingRow } from '@/lib/queries'
import { personBelongsOnProjectManage } from '@/lib/project-scope'
import { participantRoleLabel } from '@/lib/participant-role'
import { formatMoney } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'
import { PersonHandlesLine } from '@/components/person-handles'

export type TimelineLabels = {
  title: string
  hint: string
  start: string
  end: string
  pay: string
  amount: string
  detailsDone: string
  payFifteen: string
  payUpfront: string
  payEnd: string
  noContract: string
  open: string
  save: string
  saveOnly: string
  payments: string
  noAmount: string
  firstPayment: string
  secondPayment: string
  payFirst: string
  paySecond: string
  paid: string
  cancel: string
  empty: string
  paused: string
  saving: string
  editPayments: string
  urgentList: string
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
  urgentIds = [],
  canSendUrgent = false,
}: {
  people: CreatorTrackingRow[]
  pausedPeople?: CreatorTrackingRow[]
  today: string
  currentProjectId?: number | string | null
  labels: TimelineLabels
  urgentIds?: number[]
  canSendUrgent?: boolean
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingPaysId, setEditingPaysId] = useState<number | null>(null)
  const urgentSet = useMemo(() => new Set(urgentIds), [urgentIds])
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

  function toggleUrgent(person: CreatorTrackingRow) {
    if (!canSendUrgent) return
    setError(null)
    const next = !urgentSet.has(person.id)
    startTransition(async () => {
      await setCreatorUrgent(person.id, next)
      router.refresh()
    })
  }

  function toggleDone(person: CreatorTrackingRow) {
    if (!person.contract_id) return
    setError(null)
    startTransition(async () => {
      await markContractDetailsDone(person.id, person.contract_id!, !person.details_done)
      router.refresh()
    })
  }

  function payWave(person: CreatorTrackingRow, which: 'first' | 'second') {
    if (!person.contract_id) return
    setError(null)
    startTransition(async () => {
      await recordDueHalfPayment(person.id, person.contract_id!, which)
      router.refresh()
    })
  }

  function WavePay({
    person,
    which,
  }: {
    person: CreatorTrackingRow
    which: 'first' | 'second'
  }) {
    const due = which === 'first' ? person.first_due : person.second_due
    const paid = which === 'first' ? person.first_paid : person.second_paid
    const balance = which === 'first' ? person.first_balance : person.second_balance
    const settled = which === 'first' ? person.first_settled : person.second_settled
    const dueOn = which === 'first' ? person.first_due_on : person.second_due_on
    const title =
      which === 'first'
        ? person.first_label || labels.firstPayment
        : person.second_label || labels.secondPayment
    const payLabel = which === 'first' ? labels.payFirst : labels.paySecond
    if (due <= 0.009 && paid <= 0.009 && which === 'second') return null
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {dueOn ? <span className="tabular-nums">{dueOn}</span> : null}
            {dueOn ? ' · ' : null}
            {formatMoney(due, person.pay_display_currency)}
            {paid > 0.009 ? ` · ${formatMoney(paid, person.pay_display_currency)} ${labels.paid.toLowerCase()}` : ''}
          </div>
        </div>
        {settled || balance <= 0.009 ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            {labels.paid}
          </span>
        ) : person.contract_id ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => payWave(person, which)}
            className="h-8 shrink-0 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {payLabel} {formatMoney(balance, person.pay_display_currency)}
          </button>
        ) : null}
      </div>
    )
  }

  function PayEditor({ person }: { person: CreatorTrackingRow }) {
    return (
      <form
        action={(fd) => {
          setError(null)
          startTransition(async () => {
            const result = await saveTimelineWaveAmounts(fd)
            if (result && !result.ok) {
              setError(result.message)
              return
            }
            setEditingPaysId(null)
            router.refresh()
          })
        }}
        className="mt-2 flex flex-col gap-2"
      >
        <input type="hidden" name="creator_id" value={person.id} />
        <input type="hidden" name="contract_id" value={person.contract_id ?? ''} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.firstPayment} · {person.pay_display_currency}
            <input
              type="number"
              min={0}
              step="0.01"
              name="first_amount"
              required
              defaultValue={person.first_due || ''}
              className={inputClass}
            />
          </label>
          {person.has_two_pays ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.secondPayment} · {person.pay_display_currency}
              <input
                type="number"
                min={0}
                step="0.01"
                name="second_amount"
                required
                defaultValue={person.second_due || ''}
                className={inputClass}
              />
            </label>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60"
          >
            {pending ? labels.saving : labels.saveOnly}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingPaysId(null)
              setError(null)
            }}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm"
          >
            <X className="size-4" />
            <span className="ml-1">{labels.cancel}</span>
          </button>
        </div>
      </form>
    )
  }

  function Editor({ person }: { person: CreatorTrackingRow }) {
    const timing =
      person.pay_timing === 'upfront' || person.pay_timing === 'end' || person.pay_timing === 'fifteen'
        ? person.pay_timing
        : 'fifteen'
    const showPays = person.first_due > 0.009 || person.second_due > 0.009 || person.first_paid > 0.009
    return (
      <form
        action={(fd) => {
          setError(null)
          startTransition(async () => {
            const result = await saveTimelineContract(fd)
            if (result && !result.ok) {
              setError(result.message)
              return
            }
            if ((fd.get('open_calendar') ?? '').toString() !== '1') {
              setEditingId(null)
              setError(null)
              router.refresh()
            }
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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.amount} · {person.pay_display_currency}
          <input
            type="number"
            min={0}
            step="0.01"
            name="base_amount"
            defaultValue={person.pay_amount || ''}
            placeholder="0.00"
            className={inputClass}
          />
        </label>
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
        <div className="grid gap-2">
          <div className="text-xs font-medium text-foreground">{labels.payments}</div>
          {showPays ? (
            <>
              <WavePay person={person} which="first" />
              {person.has_two_pays ? <WavePay person={person} which="second" /> : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{labels.noAmount}</p>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="open_calendar"
            value="0"
            disabled={pending}
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60"
          >
            {pending ? labels.saving : labels.saveOnly}
          </button>
          <button
            type="submit"
            name="open_calendar"
            value="1"
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
            <Link
              href={adminPersonHref(person.id, {
                role: person.role,
                projectId: currentProjectId,
                from: 'timeline',
              })}
              className="font-medium underline-offset-4 hover:underline"
            >
              {person.name}
            </Link>
            <span className="text-[11px] text-muted-foreground">{participantRoleLabel(person.role)}</span>
          </div>
          <PersonHandlesLine person={person} />
          <div className="text-xs text-muted-foreground">
            {person.project_name ?? 'Both projects'}
            {' · '}
            <DateRange start={person.timeline_start} end={person.timeline_end} openLabel={labels.open} />
            {' · '}
            {timingLabel(person.pay_timing, labels)}
            {person.pay_amount > 0.009 ? (
              <>
                {' · '}
                {formatMoney(person.pay_amount, person.pay_display_currency)}
              </>
            ) : null}
          </div>
          {editingPaysId === person.id ? (
            <PayEditor person={person} />
          ) : (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {person.first_due > 0.009 || person.second_due > 0.009 ? (
                <span>
                  {labels.firstPayment} {formatMoney(person.first_due, person.pay_display_currency)}
                  {person.first_settled ? ` · ${labels.paid}` : ''}
                  {person.has_two_pays ? (
                    <>
                      {' · '}
                      {labels.secondPayment} {formatMoney(person.second_due, person.pay_display_currency)}
                      {person.second_settled ? ` · ${labels.paid}` : ''}
                    </>
                  ) : null}
                </span>
              ) : null}
              {person.contract_id ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPaysId(person.id)
                    setEditingId(null)
                    setError(null)
                  }}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent"
                >
                  {labels.editPayments}
                </button>
              ) : null}
              {canSendUrgent ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={urgentSet.has(person.id)}
                  onClick={() => toggleUrgent(person)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60 ${
                    urgentSet.has(person.id)
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-foreground'
                  }`}
                >
                  {labels.urgentList}
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pending || !person.contract_id}
            onClick={() => toggleDone(person)}
            aria-pressed={person.details_done}
            title={labels.detailsDone}
            className={`rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-40 ${
              person.details_done ? 'text-blue-600' : 'text-muted-foreground'
            }`}
          >
            <Heart className={`size-3.5 ${person.details_done ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(person.id)
              setEditingPaysId(null)
              setError(null)
            }}
            className="rounded-md border border-border p-1.5 hover:bg-accent"
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
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
