'use client'

import { useTransition } from 'react'
import type { Contract } from '@/lib/db'
import type { PaymentRow } from '@/lib/queries'
import { deletePayment, recordPayment } from '@/app/actions/admin'
import { formatDate, formatMoney } from '@/lib/format'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function PaymentsManager({
  creatorId,
  today,
  contracts,
  payments,
  paidTotal,
}: {
  creatorId: number
  today: string
  contracts: Contract[]
  payments: PaymentRow[]
  paidTotal?: number
}) {
  const [pending, startTransition] = useTransition()
  const latest = payments[0] ?? null
  const total =
    paidTotal ??
    payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Total paid = this list only</p>
        <p className="mt-1">
          Filling base/commission on a <span className="text-foreground">past</span> contract and saving
          (or tapping “Record past amounts as paid” under Contracts) adds rows here. Current-contract
          terms do not.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Total paid</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(total)}</p>
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
              <span className="font-semibold tabular-nums">{formatMoney(latest.amount)}</span>
              {' on '}
              {formatDate(latest.paid_on)}
              {latest.note ? ` · ${latest.note}` : ''}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              None yet. Open Contracts and use “Record past amounts as paid”.
            </p>
          )}
        </div>
      </div>

      <form
        action={(fd) => startTransition(() => recordPayment(creatorId, fd))}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Add a payment manually</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Usually you don’t need this — saving a past contract records pay for you. Use this for
          extras / bonuses.
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
                <th className="px-4 py-3 font-medium">Contract</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(p.paid_on)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                    {formatMoney(p.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.contract_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.note ?? '—'}</td>
                  <td className="px-2 py-2 text-right">
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
