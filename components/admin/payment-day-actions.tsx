'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { payCalendarAmount, unpayCalendarInstallment } from '@/app/actions/admin'
import { payStructureAmount, unpayStructureInstallment } from '@/app/actions/company-structure'
import { subjectKeyFromCalendarId } from '@/lib/company-roles'
import { formatMoney } from '@/lib/format'
import { CalendarPayEdit } from '@/components/admin/calendar-pay-edit'

export function DayPayControls({
  creatorId,
  contractId,
  installmentIndex,
  dueOn,
  dueAmount,
  remaining,
  paidAmount,
  currency,
  payLabel,
  unpayLabel,
  editLabels,
}: {
  creatorId: number
  contractId: number
  installmentIndex: number
  dueOn: string
  dueAmount: number
  remaining: number
  paidAmount: number
  currency: 'USD' | 'SAR'
  payLabel: string
  unpayLabel: string
  editLabels: { edit: string; when: string; save: string; cancel: string; saving: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const companyKey = creatorId < 0 ? subjectKeyFromCalendarId(creatorId) : null
  if (creatorId < 0 && !companyKey) return null
  const canPay = remaining > 0.009
  const canUnpay = paidAmount > 0.009

  function finish(result: { ok: boolean; message?: string } | void) {
    if (result && !result.ok) {
      setError(result.message ?? 'Could not save.')
      return
    }
    router.refresh()
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {canPay ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = companyKey
                  ? await payStructureAmount(companyKey, installmentIndex, remaining)
                  : await payCalendarAmount(creatorId, contractId, installmentIndex, remaining)
                finish(result)
              })
            }
            className="h-8 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? '…' : `${payLabel} ${formatMoney(remaining, currency)}`}
          </button>
        ) : null}
        {canUnpay ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = companyKey
                  ? await unpayStructureInstallment(companyKey, installmentIndex)
                  : await unpayCalendarInstallment(creatorId, contractId, installmentIndex)
                finish(result)
              })
            }
            className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-semibold disabled:opacity-60"
          >
            {unpayLabel}
          </button>
        ) : null}
      </div>
      <CalendarPayEdit
        creatorId={creatorId}
        contractId={contractId}
        installmentIndex={installmentIndex}
        dueOn={dueOn}
        amount={dueAmount}
        currency={currency}
        labels={editLabels}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
