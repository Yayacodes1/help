'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Heart, Pencil, X } from 'lucide-react'
import {
  markContractDetailsDone,
  recordDueHalfPayment,
  saveTimelineContract,
  saveTimelineWaveAmounts,
} from '@/app/actions/admin'
import { saveCompanyRoleName, saveStructureContract, saveStructureWaveAmounts, recordStructureHalf, setStructureDetailsDone } from '@/app/actions/company-structure'
import { PersonHandlesLine } from '@/components/person-handles'
import { formatMoney } from '@/lib/format'
import type { StructurePaySlot, StructurePayTiming } from '@/lib/company-roles'

const GROUPS: Array<{ tier: StructurePaySlot['tier']; title: string; dropdown: boolean }> = [
  { tier: 'ceo', title: 'CEO & Founder', dropdown: false },
  { tier: 'coo', title: 'COO', dropdown: false },
  { tier: 'deputy_coo', title: 'Deputy COO', dropdown: false },
  { tier: 'leader', title: 'Leaders', dropdown: true },
  { tier: 'outreach', title: 'Outreach', dropdown: true },
  { tier: 'reposter', title: 'Reposters', dropdown: true },
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
  const [editingPays, setEditingPays] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((group) => {
        const people = slots.filter((slot) => slot.tier === group.tier)
        if (people.length === 0) return null
        const body = (
          <ul className="flex flex-col">
            {people.map((slot) => (
              <li key={slot.subjectKey} className="border-b border-border px-4 py-3 last:border-b-0">
                {slot.tier === 'ceo' ? (
                  <div>
                    <div className="font-medium">{slot.name}</div>
                    <p className="text-xs text-muted-foreground">Owner · no salary</p>
                  </div>
                ) : editing === slot.subjectKey && canEdit ? (
                  <PayForm slot={slot} today={today} onClose={() => setEditing(null)} />
                ) : (
                  <PayRow
                    slot={slot}
                    canEdit={canEdit}
                    editingPays={editingPays === slot.subjectKey}
                    onEdit={() => {
                      setEditing(slot.subjectKey)
                      setEditingPays(null)
                    }}
                    onEditPays={() => {
                      setEditingPays(slot.subjectKey)
                      setEditing(null)
                    }}
                    onClosePays={() => setEditingPays(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )
        if (!group.dropdown) {
          return (
            <section key={group.tier} className="rounded-xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{group.title}</h3>
              {body}
            </section>
          )
        }
        return (
          <details key={group.tier} className="group rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                {group.title}
              </span>
              <span className="tabular-nums text-xs font-medium text-muted-foreground">{people.length}</span>
            </summary>
            {body}
          </details>
        )
      })}
    </div>
  )
}

function PayRow({
  slot,
  canEdit,
  editingPays,
  onEdit,
  onEditPays,
  onClosePays,
}: {
  slot: StructurePaySlot
  canEdit: boolean
  editingPays: boolean
  onEdit: () => void
  onEditPays: () => void
  onClosePays: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const showPays = slot.firstDue > 0.009 || slot.secondDue > 0.009 || slot.firstPaid > 0.009

  function pay(which: 'first' | 'second') {
    startTransition(async () => {
      if (slot.tier === 'reposter' && slot.creatorId && slot.contractId) {
        await recordDueHalfPayment(slot.creatorId, slot.contractId, which)
      } else {
        await recordStructureHalf(slot.subjectKey, which)
      }
      router.refresh()
    })
  }

  function toggleDone() {
    startTransition(async () => {
      if (slot.tier === 'reposter' && slot.creatorId && slot.contractId) {
        await markContractDetailsDone(slot.creatorId, slot.contractId, !slot.detailsDone)
      } else {
        await setStructureDetailsDone(slot.subjectKey, !slot.detailsDone)
      }
      router.refresh()
    })
  }

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
              {slot.tier !== 'reposter' && !slot.scheduled ? ' · Not on the calendar yet' : ''}
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
        {editingPays && canEdit ? (
          <WaveForm slot={slot} onClose={onClosePays} />
        ) : showPays ? (
          <div className="mt-2 flex flex-col gap-2">
            <WaveLine slot={slot} which="first" pending={pending} canEdit={canEdit} onPay={() => pay('first')} />
            {slot.hasTwoPays ? (
              <WaveLine slot={slot} which="second" pending={pending} canEdit={canEdit} onPay={() => pay('second')} />
            ) : null}
            {canEdit && (slot.tier === 'reposter' ? slot.contractId : slot.scheduled) ? (
              <button
                type="button"
                onClick={onEditPays}
                className="w-fit rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
              >
                Edit payments
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pending || (slot.tier === 'reposter' ? !slot.contractId : !slot.scheduled)}
            onClick={toggleDone}
            aria-pressed={slot.detailsDone}
            title="Details finished"
            className={`rounded-md border border-border p-1.5 hover:bg-accent disabled:opacity-40 ${
              slot.detailsDone ? 'text-blue-600' : 'text-muted-foreground'
            }`}
          >
            <Heart className={`size-3.5 ${slot.detailsDone ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-border p-1.5 hover:bg-accent"
            title="Edit pay"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function WaveLine({
  slot,
  which,
  pending,
  canEdit,
  onPay,
}: {
  slot: StructurePaySlot
  which: 'first' | 'second'
  pending: boolean
  canEdit: boolean
  onPay: () => void
}) {
  const due = which === 'first' ? slot.firstDue : slot.secondDue
  const paid = which === 'first' ? slot.firstPaid : slot.secondPaid
  const balance = which === 'first' ? slot.firstBalance : slot.secondBalance
  const settled = which === 'first' ? slot.firstSettled : slot.secondSettled
  const dueOn = which === 'first' ? slot.firstDueOn : slot.secondDueOn
  const title = which === 'first' ? slot.firstLabel : slot.secondLabel
  if (due <= 0.009 && paid <= 0.009) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {dueOn ? <span className="tabular-nums">{dueOn}</span> : null}
          {dueOn ? ' · ' : null}
          {formatMoney(due, slot.currency)}
          {paid > 0.009 ? ` · ${formatMoney(paid, slot.currency)} paid` : ''}
        </div>
      </div>
      {settled || balance <= 0.009 ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          Paid
        </span>
      ) : canEdit ? (
        <button
          type="button"
          disabled={pending}
          onClick={onPay}
          className="h-8 shrink-0 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          Pay {formatMoney(balance, slot.currency)}
        </button>
      ) : null}
    </div>
  )
}

function WaveForm({ slot, onClose }: { slot: StructurePaySlot; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <form
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          const result =
            slot.tier === 'reposter' ? await saveTimelineWaveAmounts(fd) : await saveStructureWaveAmounts(fd)
          if (result && !result.ok) {
            setError(result.message)
            return
          }
          onClose()
          router.refresh()
        })
      }}
      className="mt-2 flex flex-col gap-2"
    >
      {slot.tier === 'reposter' && slot.creatorId ? (
        <input type="hidden" name="creator_id" value={slot.creatorId} />
      ) : (
        <input type="hidden" name="subject_key" value={slot.subjectKey} />
      )}
      {slot.contractId ? <input type="hidden" name="contract_id" value={slot.contractId} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          First payment · when
          <input type="date" name="first_on" defaultValue={slot.firstDueOn ?? ''} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          First payment · {slot.currency}
          <input
            type="number"
            min={0}
            step="0.01"
            name="first_amount"
            required
            defaultValue={slot.firstDue || ''}
            className={inputClass}
          />
        </label>
        {slot.hasTwoPays ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Second payment · when
              <input type="date" name="second_on" defaultValue={slot.secondDueOn ?? ''} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Second payment · {slot.currency}
              <input
                type="number"
                min={0}
                step="0.01"
                name="second_amount"
                required
                defaultValue={slot.secondDue || ''}
                className={inputClass}
              />
            </label>
          </>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm">
          <X className="size-4" />
          <span className="ml-1">Cancel</span>
        </button>
      </div>
    </form>
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
  const executive = slot.tier === 'ceo' || slot.tier === 'coo' || slot.tier === 'deputy_coo'
  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          if (executive) {
            const named = await saveCompanyRoleName(fd)
            if (!named.ok) {
              setError(named.error)
              return
            }
          }
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
      {executive ? <input type="hidden" name="role" value={slot.tier} /> : null}
      {slot.tier === 'reposter' && slot.creatorId ? (
        <input type="hidden" name="creator_id" value={slot.creatorId} />
      ) : (
        <input type="hidden" name="subject_key" value={slot.subjectKey} />
      )}
      {slot.contractId ? <input type="hidden" name="contract_id" value={slot.contractId} /> : null}
      <input type="hidden" name="pay_currency" value={slot.currency} />
      <input type="hidden" name="open_calendar" value="0" />
      {executive ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <input name="name" defaultValue={slot.name} className={inputClass} />
        </label>
      ) : (
        <div className="font-medium">{slot.name}</div>
      )}
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
          Every 15 days — first pay 15 days after the start, last pay at the end
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pay_timing" value="upfront" defaultChecked={timing === 'upfront'} />
          Upfront — pay at the start, then every 2 weeks
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pay_timing" value="end" defaultChecked={timing === 'end'} />
          One payment on the last day
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
