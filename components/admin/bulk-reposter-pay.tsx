'use client'

import { useRef, useState, useTransition } from 'react'
import { recordBulkReposterPayment } from '@/app/actions/bulk-reposter-pay'

export function BulkReposterPay({
  today,
  selectedIds,
}: {
  today: string
  selectedIds: number[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const count = selectedIds.length

  return (
    <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
      <p className="text-sm font-semibold text-sky-950">Pay selected reposters the same</p>
      <p className="mt-0.5 text-xs text-sky-900/80">
        {count === 0
          ? 'Tick one or more people below, then record the same amount for each.'
          : `Records one payment of this amount for each of the ${count} selected reposter${count === 1 ? '' : 's'}.`}
      </p>
      <form
        ref={formRef}
        className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        action={(fd) =>
          startTransition(async () => {
            setMessage(null)
            for (const id of selectedIds) fd.append('ids', String(id))
            const result = await recordBulkReposterPayment(fd)
            if (!result.ok) {
              setMessage(result.error)
              return
            }
            setMessage(
              `Paid ${result.count} reposter${result.count === 1 ? '' : 's'} ${result.amount.toFixed(2)} each on ${result.paidOn}.`,
            )
            formRef.current?.reset()
          })
        }
      >
        <label className="flex flex-col gap-1 text-xs text-sky-950/80">
          Amount (USD)
          <input
            type="number"
            name="amount"
            min={0}
            step="0.01"
            required
            placeholder="e.g. 50"
            className="h-9 w-28 rounded-lg border border-sky-200 bg-white px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-sky-950/80">
          Paid on
          <input
            type="date"
            name="paid_on"
            required
            defaultValue={today}
            className="h-9 rounded-lg border border-sky-200 bg-white px-2 text-sm"
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-sky-950/80">
          Note (optional)
          <input
            type="text"
            name="note"
            placeholder="Bulk reposter pay"
            className="h-9 rounded-lg border border-sky-200 bg-white px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || count === 0}
          className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending
            ? 'Paying…'
            : count === 0
              ? 'Select people to pay'
              : `Pay ${count} selected`}
        </button>
      </form>
      {message ? <p className="mt-2 text-xs text-sky-950">{message}</p> : null}
    </div>
  )
}
