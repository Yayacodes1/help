'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setCreatorUrgent } from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { MoneyPair } from '@/components/admin/money-pair'
import type { ParticipantRole } from '@/lib/participant-role'

type UrgentPayRow = {
  id: number
  name: string
  role: ParticipantRole
  dueOn: string | null
  amountSar: number
  daysLate: number
  settled: boolean
}

function dueLabel(dueOn: string, locale: string): string {
  const date = new Date(`${dueOn}T00:00:00Z`)
  return date.toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function lateLabel(days: number, locale: string): string {
  if (locale === 'ar') {
    return days === 1 ? 'تأخرنا عليهم بيوم' : `تأخرنا عليهم بـ ${days} أيام`
  }
  return days === 1 ? 'Late by 1 day' : `Late by ${days} days`
}

export function UrgentList({
  rows,
  locale,
  canRemove,
  labels,
}: {
  rows: UrgentPayRow[]
  locale: string
  canRemove: boolean
  labels: { empty: string; noDate: string; paid: string; remove: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.empty}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={adminPersonHref(row.id, { role: row.role, from: 'urgent' })}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
            {row.amountSar > 0.009 ? <MoneyPair sar={row.amountSar} /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.dueOn ? dueLabel(row.dueOn, locale) : labels.noDate}
            {row.settled ? ` · ${labels.paid}` : ''}
          </p>
          {row.daysLate > 0 ? (
            <p className="mt-1 text-sm font-medium text-destructive">{lateLabel(row.daysLate, locale)}</p>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await setCreatorUrgent(row.id, false)
                  router.refresh()
                })
              }}
              className="mt-2 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
            >
              {labels.remove}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
