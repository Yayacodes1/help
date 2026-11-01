'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { payCalendarAmount, unpayCalendarInstallment } from '@/app/actions/admin'
import { payStructureAmount, unpayStructureInstallment } from '@/app/actions/company-structure'
import { subjectKeyFromCalendarId } from '@/lib/company-roles'
import { formatMoney } from '@/lib/format'

export function DayPayToggle({
  paid,
  creatorId,
  contractId,
  installmentIndex,
  amount,
  currency,
  payLabel,
  unpayLabel,
  showUnpay = false,
}: {
  paid: boolean
  creatorId: number
  contractId: number
  installmentIndex: number
  amount: number
  currency: 'USD' | 'SAR'
  payLabel: string
  unpayLabel: string
  /** A partial payment can still be undone. */
  showUnpay?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState(amount > 0.009 ? String(amount) : '')
  const companyKey = creatorId < 0 ? subjectKeyFromCalendarId(creatorId) : null
  if (creatorId < 0 && !companyKey) return null
  const typed = Math.round((Number(value) || 0) * 100) / 100

  async function unpay() {
    if (companyKey) return unpayStructureInstallment(companyKey, installmentIndex)
    return unpayCalendarInstallment(creatorId, contractId, installmentIndex)
  }

  return (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
      {paid ? null : (
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={currency}
          className="h-8 w-24 rounded-lg border border-input bg-background px-2 text-sm"
        />
      )}
      <button
        type="button"
        disabled={pending || (!paid && typed <= 0)}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = paid
              ? await unpay()
              : companyKey
                ? await payStructureAmount(companyKey, installmentIndex, typed)
                : await payCalendarAmount(creatorId, contractId, installmentIndex, typed)
            if (result && !result.ok) {
              setError(result.message ?? 'Could not save.')
              return
            }
            router.refresh()
          })
        }
        className="h-8 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? '…' : paid ? unpayLabel : `${payLabel} ${formatMoney(typed, currency)}`}
      </button>
      {!paid && showUnpay ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await unpay()
              if (result && !result.ok) {
                setError(result.message ?? 'Could not save.')
                return
              }
              router.refresh()
            })
          }
          className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-semibold disabled:opacity-60"
        >
          {unpayLabel}
        </button>
      ) : null}
      {error ? <p className="w-full text-right text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
