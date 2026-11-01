'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTimelineInstallment } from '@/app/actions/admin'
import { saveStructureInstallment } from '@/app/actions/company-structure'

export function CalendarPayEdit({
  creatorId,
  contractId,
  installmentIndex,
  dueOn,
  amount,
  currency,
  labels,
}: {
  creatorId: number
  contractId: number
  installmentIndex: number
  dueOn: string
  amount: number
  currency: string
  labels: { edit: string; when: string; save: string; cancel: string; saving: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-fit rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
      >
        {labels.edit}
      </button>
    )
  }
  return (
    <form
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          const result =
            creatorId < 0 ? await saveStructureInstallment(fd) : await saveTimelineInstallment(fd)
          if (result && !result.ok) {
            setError(result.message ?? 'Could not save.')
            return
          }
          setOpen(false)
          router.refresh()
        })
      }}
      className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <input type="hidden" name="creator_id" value={creatorId} />
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="installment_index" value={installmentIndex} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {labels.when}
        <input
          type="date"
          name="pay_on"
          required
          defaultValue={dueOn}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {currency}
        <input
          type="number"
          name="amount"
          min={0}
          step="0.01"
          required
          defaultValue={amount || ''}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="h-9 rounded-lg border border-border px-3 text-sm"
        >
          {labels.cancel}
        </button>
      </div>
      {error ? <p className="text-sm text-destructive sm:col-span-3">{error}</p> : null}
    </form>
  )
}
