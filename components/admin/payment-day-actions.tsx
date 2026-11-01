'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordDueHalfPayment } from '@/app/actions/admin'
import { recordStructureHalf } from '@/app/actions/company-structure'
import { subjectKeyFromCalendarId } from '@/lib/company-roles'
import { formatMoney } from '@/lib/format'

export function PaymentDayActions({
  creatorId,
  contractId,
  remaining,
  currency,
  which = 'first',
  payLabel,
}: {
  creatorId: number
  contractId: number
  remaining: number
  currency: 'USD' | 'SAR'
  which?: 'first' | 'second'
  payLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const companyKey = creatorId < 0 ? subjectKeyFromCalendarId(creatorId) : null
  if (remaining <= 0.009) return null
  if (creatorId < 0 && !companyKey) return null
  const wave = which === 'second' ? 'second' : 'first'
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (companyKey) await recordStructureHalf(companyKey, wave)
          else await recordDueHalfPayment(creatorId, contractId, wave)
          router.refresh()
        })
      }
      className="mt-1 h-8 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? '…' : `${payLabel} ${formatMoney(remaining, currency)}`}
    </button>
  )
}
