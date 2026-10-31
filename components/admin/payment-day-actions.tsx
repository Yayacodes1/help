'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordDueHalfPayment } from '@/app/actions/admin'
import { formatMoney } from '@/lib/format'

export function PaymentDayActions({
  creatorId,
  contractId,
  remainingSar,
  currency,
  which = 'first',
}: {
  creatorId: number
  contractId: number
  remainingSar: number
  currency: 'USD' | 'SAR'
  which?: 'first' | 'second'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (remainingSar <= 0.009) return null
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await recordDueHalfPayment(creatorId, contractId, which === 'second' ? 'second' : 'first')
          router.refresh()
        })
      }
      className="h-8 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? '…' : `Record ${formatMoney(remainingSar, currency)}`}
    </button>
  )
}
