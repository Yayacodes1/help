'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { saveTimelineContract } from '@/app/actions/admin'
import { saveStructureContract } from '@/app/actions/company-structure'
import { PersonHandlesLine } from '@/components/person-handles'
import { formatMoney } from '@/lib/format'
import type { StructurePaySlot, StructurePayTiming } from '@/lib/company-roles'

const GROUPS: Array<{ tier: StructurePaySlot['tier']; title: string }> = [
  { tier: 'ceo', title: 'CEO & Founder' },
  { tier: 'coo', title: 'COO' },
  { tier: 'deputy_coo', title: 'Deputy COO' },
  { tier: 'leader', title: 'Leaders' },
  { tier: 'outreach', title: 'Outreach' },
  { tier: 'reposter', title: 'Reposters' },
]

function timingLabel(timing: StructurePayTiming | null): string {
  if (timing === 'upfront') return 'Upfront'
  if (timing === 'end') return 'One payment at the end'
  if (timing === 'fifteen') return 'Every 15 days'
  return 'No pay set'
}

export function StructurePayBoard({
  slots,
  today,
  canEdit,
}: {
  slots: StructurePaySlot[]
  today: string
  canEdit: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((group) => {
        const people = slots.filter((slot) => slot.tier === group.tier)
        if (people.length === 0) return null
        return (
          <section key={group.tier} className="rounded-xl border border-border bg-card">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
              {group.title}
              <span className="ml-2 tabular-nums text-xs font-medium text-muted-foreground">{people.length}</span>
            </h3>
            <ul className="flex flex-col">
              {people.map((slot) => (
                <li key={slot.subjectKey} className="border-b border-border px-4 py-3 last:border-b-0">
                  {editing === slot.subjectKey && canEdit ? (
                    <PayForm slot={slot} today={today} onClose={() => setEditing(null)} />
                  ) : (
                    <PayRow slot={slot} canEdit={canEdit} onEdit={() => setEditing(slot.subjectKey)} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function PayRow({
  slot,
  canEdit,
  onEdit,
}: {
  slot: StructurePaySlot
  canEdit: boolean
  onEdit: () => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          {slot.href ? (
            <Link href={slot.href} className="font-medium underline-offset-4 hover:underline">
              {slot.name}
            </Link>
          ) : (
            <span className="font-medium">{slot.name}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{slot.title}</span>
        </div>
        {slot.tier === 'reposter' ? <PersonHandlesLine person={slot} /> : null}
        <p className="text-xs text-muted-foreground">
          {slot.start ? (
            <>
              <span className="tabular-nums">
                {slot.start}
                {' → '}
                {slot.end ?? 'open'}
              </span>
              {' · '}
              {timingLabel(slot.timing)}
              {slot.amount > 0.009 ? ` · ${formatMoney(slot.amount, slot.currency)}` : ''}
            </>
          ) : slot.amount > 0.009 ? (
            <>
              Not on the calendar yet
              {' · '}
              {timingLabel(slot.timing)}
              {` · ${formatMoney(slot.amount, slot.currency)}`}
            </>
          ) : (
            'No pay set'
          )}
        </p>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-border p-1.5 hover:bg-accent"
          title="Edit pay"
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function PayForm({
  slot,
  today,
  onClose,
}: {
  slot: StructurePaySlot
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const timing = slot.timing ?? 'fifteen'
  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          const result =
            slot.tier === 'reposter' ? await saveTimelineContract(fd) : await saveStructureContract(fd)
          if (result && !result.ok) {
            setError(result.message)
            return
          }
          onClose()
          router.refresh()
        })
      }}
      className="flex flex-col gap-3"
    >
      {slot.tier === 'reposter' && slot.creatorId ? (
        <input type="hidden" name="creator_id" value={slot.creatorId} />
      ) : (
        <input type="hidden" name="subject_key" value={slot.subjectKey} />
      )}
      {slot.contractId ? <input type="hidden" name="contract_id" value={slot.contractId} /> : null}
      <input type="hidden" name="pay_currency" value={slot.currency} />
      <input type="hidden" name="open_calendar" value="0" />
      <div className="font-medium">{slot.name}</div>
      {slot.tier === 'reposter' ? <PersonHandlesLine person={slot} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Start
          <input type="date" name="start_date" required defaultValue={slot.start ?? today} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          End
          <input type="date" name="end_date" defaultValue={slot.end ?? ''} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Pay amount · {slot.currency}
        <input
          type="number"
          min={0}
          step="0.01"
          name="base_amount"
          defaultValue={slot.amount || ''}
          className={inputClass}
        />
      </label>
      <fieldset className="grid gap-1.5 text-xs">
        <label className="flex items-center gap-2">
          <input type="radio" name="pay_timing" value="fifteen" defaultChecked={timing === 'fifteen'} />
          Every 15 days
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pay_timing" value="upfront" defaultChecked={timing === 'upfront'} />
          Upfront
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pay_timing" value="end" defaultChecked={timing === 'end'} />
          One payment at the end
        </label>
      </fieldset>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm"
        >
          <X className="size-4" />
          <span className="ml-1">Cancel</span>
        </button>
      </div>
    </form>
  )
}
