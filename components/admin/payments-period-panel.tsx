'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { PaymentRow } from '@/lib/queries'
import { formatDate, formatMoney } from '@/lib/format'

export function PaymentsPeriodPanel({
  payments,
  total,
  defaultFrom,
  defaultTo,
}: {
  payments: PaymentRow[]
  total: number
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const from = params.get('payFrom') || defaultFrom
  const to = params.get('payTo') || defaultTo

  function setRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString())
    if (nextFrom) next.set('payFrom', nextFrom)
    else next.delete('payFrom')
    if (nextTo) next.set('payTo', nextTo)
    else next.delete('payTo')
    next.set('panel', 'payments')
    router.push(`/admin?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setRange(e.target.value, to)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setRange(from, e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <div className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold tabular-nums">
          Total {formatMoney(total)}
        </div>
      </div>

      {payments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No payments in this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Contract</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(p.paid_on)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{p.creator_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {p.contract_name ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                    {formatMoney(p.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
