'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Contract, PaymentAmountKind } from '@/lib/db'
import type { PaymentRow } from '@/lib/queries'
import {
  addMissingCommissionPayments,
  deletePayment,
  recordPayment,
  updatePayment,
} from '@/app/actions/admin'
import { formatDate, formatMoney } from '@/lib/format'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function kindLabel(kind: PaymentAmountKind | null | undefined): string {
  if (kind === 'base') return 'Base'
  if (kind === 'commission') return 'Commission'
  return 'Full amount'
}

function kindClass(kind: PaymentAmountKind | null | undefined): string {
  if (kind === 'base') return 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
  if (kind === 'commission') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  return 'bg-primary/10 text-primary'
}

/** Who actually paid the creator (Ahmed’s wallet vs Yahya / Lula / Sultan…). */
function payerLabel(paidBy?: string | null, recordedBy?: string | null): string {
  if (paidBy === 'ahmed') return 'Ahmed'
  const id = (recordedBy ?? '').trim().toLowerCase()
  if (id === 'yahya') return 'Yahya'
  if (id === 'ahmed') return 'Ahmed'
  if (id === 'lula') return 'Lula'
  if (id === 'sultan') return 'Sultan'
  if (id) return id.charAt(0).toUpperCase() + id.slice(1)
  return '—'
}

function paidFromDefault(paidBy?: string | null): 'ahmed' | 'direct' {
  return paidBy === 'ahmed' ? 'ahmed' : 'direct'
}

export function PaymentsManager({
  creatorId,
  today,
  contracts,
  payments,
  paidTotal,
  isOwner = false,
  currency = 'SAR',
}: {
  /** Reposters are paid in USD, creators in SAR. */
  currency?: 'USD' | 'SAR'
  creatorId: number
  today: string
  contracts: Contract[]
  payments: PaymentRow[]
  paidTotal?: number
  /** Yahya can mark a payment as paid directly (not from Ahmed's wallet). */
  isOwner?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const latest = payments[0] ?? null
  const total =
    paidTotal ??
    payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Total paid = this list only</p>
        <p className="mt-1">
          Each row is <span className="text-foreground">Full amount</span> (base + commission),{' '}
          <span className="text-foreground">Base</span>, or{' '}
          <span className="text-foreground">Commission</span>. Untagged old rows count as Full amount.
        </p>
        <p className="mt-1">
          Tap <span className="text-foreground">Edit</span> on any previous payment to change the
          amount (e.g. they only did 30 videos), date, kind, or who paid.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Total paid</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(total, currency)}</p>
          <p className="text-[11px] text-muted-foreground">{currency === 'USD' ? 'US dollars' : 'Saudi riyals'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {payments.length === 0
              ? 'Empty — money typed on contracts was not recorded yet.'
              : `${payments.length} recorded payment${payments.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Last payment</h2>
          {latest ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold tabular-nums">{formatMoney(latest.amount, currency)}</span>
              {' · '}
              {kindLabel(latest.amount_kind)}
              {' on '}
              {formatDate(latest.paid_on)}
              {' · paid by '}
              <span className="font-medium text-foreground">
                {payerLabel(latest.paid_by, latest.recorded_by)}
              </span>
              {latest.note ? ` · ${latest.note}` : ''}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              None yet. Open Contracts and use “Record past amounts as paid”.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-4">
        <p className="text-sm font-semibold">Missing commission on past pays?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adds a Commission row for every contract that has commission set but no commission payment yet.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setBackfillMsg(null)
            startTransition(async () => {
              const res = await addMissingCommissionPayments(creatorId)
              if (!res.ok) {
                setBackfillMsg(res.error)
                return
              }
              setBackfillMsg(
                res.added === 0
                  ? 'Nothing missing — commission already recorded where set.'
                  : `Added ${res.added} commission payment${res.added === 1 ? '' : 's'}.`,
              )
              router.refresh()
            })
          }}
          className="mt-3 h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Add commission to previous payments'}
        </button>
        {backfillMsg ? <p className="mt-2 text-xs text-muted-foreground">{backfillMsg}</p> : null}
      </div>

      <form
        action={(fd) => startTransition(() => recordPayment(creatorId, fd))}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Add a payment manually</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Usually you don’t need this — saving a past contract records pay for you. Use this for
          extras / bonuses. Pick whether this row is full amount, base, or commission.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Paid on
            <input type="date" name="paid_on" required defaultValue={today} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Amount
            <input
              type="number"
              name="amount"
              min={0}
              step="0.01"
              required
              placeholder="0.00"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            What is this?
            <select name="amount_kind" defaultValue="full" className={inputClass}>
              <option value="full">Full amount (base + commission)</option>
              <option value="base">Base only</option>
              <option value="commission">Commission only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Contract
            <select name="contract_id" defaultValue="" className={inputClass}>
              <option value="">Pick the period you paid for</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.end_date ? ` · ended ${c.end_date}` : ' · current/open'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Note
            <input name="note" placeholder="Bonus, adjustment…" className={inputClass} />
          </label>
          {isOwner ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              Who sent the money?
              <select name="paid_from" defaultValue="ahmed" className={inputClass}>
                <option value="ahmed">Ahmed, from the money I gave him</option>
                <option value="direct">I paid them myself</option>
              </select>
            </label>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 h-10 w-full rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Save payment
        </button>
      </form>

      {payments.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Paid by</th>
                <th className="px-4 py-3 font-medium">Contract</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(p.paid_on)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                      {formatMoney(p.amount, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${kindClass(p.amount_kind)}`}>
                        {kindLabel(p.amount_kind)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {payerLabel(p.paid_by, p.recorded_by)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.contract_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.note ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        className="mr-2 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {editingId === p.id ? 'Close' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm('Delete this payment?')) {
                            startTransition(() => deletePayment(p.id, creatorId))
                          }
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editingId === p.id ? (
                    <tr className="border-b border-border bg-muted/30">
                      <td colSpan={7} className="px-4 py-3">
                        <form
                          action={(fd) =>
                            startTransition(() => {
                              void updatePayment(p.id, creatorId, fd).then(() => {
                                setEditingId(null)
                                router.refresh()
                              })
                            })
                          }
                          className="grid gap-2 sm:grid-cols-2"
                        >
                          <p className="sm:col-span-2 text-xs text-muted-foreground">
                            Change this previous payment — e.g. lower the amount if they only finished
                            part of the videos.
                          </p>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Paid on
                            <input
                              type="date"
                              name="paid_on"
                              required
                              defaultValue={p.paid_on}
                              className={inputClass}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Amount
                            <input
                              type="number"
                              name="amount"
                              min={0}
                              step="0.01"
                              required
                              defaultValue={p.amount}
                              className={inputClass}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            What is this?
                            <select
                              name="amount_kind"
                              defaultValue={p.amount_kind || 'full'}
                              className={inputClass}
                            >
                              <option value="full">Full amount (base + commission)</option>
                              <option value="base">Base only</option>
                              <option value="commission">Commission only</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Who sent the money?
                            <select
                              name="paid_from"
                              defaultValue={paidFromDefault(p.paid_by)}
                              className={inputClass}
                            >
                              <option value="ahmed">Ahmed</option>
                              <option value="direct">Direct (not from Ahmed’s wallet)</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                            Contract
                            <select
                              name="contract_id"
                              defaultValue={p.contract_id ?? ''}
                              className={inputClass}
                            >
                              <option value="">No contract linked</option>
                              {contracts.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {c.end_date ? ` · ended ${c.end_date}` : ' · current/open'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                            Note
                            <input
                              name="note"
                              defaultValue={p.note ?? ''}
                              placeholder="Bonus, adjustment…"
                              className={inputClass}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <button
                              type="submit"
                              disabled={pending}
                              className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                            >
                              {pending ? 'Saving…' : 'Save changes'}
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => setEditingId(null)}
                              className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No payments recorded. Go to Contracts → “Record past amounts as paid”.
        </p>
      )}
    </div>
  )
}
