'use client'

import { useState } from 'react'
import { formatMoney, formatYearMonth } from '@/lib/format'
import type { PaymentArchiveMonth } from '@/lib/payment-archive'
import { MoneyPair } from '@/components/admin/money-pair'
import { participantRoleLabel } from '@/lib/participant-role'

export function PaymentArchive({
  months,
  locale,
  labels,
}: {
  months: PaymentArchiveMonth[]
  locale: string
  labels: {
    card: string
    empty: string
    finished: string
    open: string
    videos: string
  }
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const selected = months.find((month) => month.month === openMonth) ?? null
  const monthName = selected
    ? formatYearMonth(selected.month, locale).replace(/ \d{4}$/, '')
    : ''
  const heading = selected
    ? locale === 'ar'
      ? `${labels.card} ${monthName}`
      : `${monthName}'s ${labels.card}`
    : ''

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((month) => {
          const open = month.month === openMonth
          const name = formatYearMonth(month.month, locale)
          return (
            <button
              key={month.month}
              type="button"
              aria-expanded={open}
              onClick={() => setOpenMonth(open ? null : month.month)}
              className={`rounded-xl border bg-card p-4 text-left hover:bg-accent ${
                open ? 'border-foreground' : 'border-border'
              }`}
            >
              <div className="text-sm font-semibold">{name}</div>
              <div className="mt-2">
                <MoneyPair sar={month.totalSar} />
              </div>
            </button>
          )
        })}
      </div>
      {selected ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-base font-semibold">{heading}</h3>
          {selected.people.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {selected.people.map((person) => (
                <li key={person.key} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{person.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {' · '}
                        {participantRoleLabel(person.role)}
                      </span>
                    </div>
                    <MoneyPair sar={person.paidSar} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {person.start ?? '—'}
                      {' → '}
                      {person.end ?? '—'}
                    </span>
                    {' · '}
                    {person.finished ? labels.finished : labels.open}
                    {person.targetTotal > 0
                      ? ` · ${labels.videos} ${person.videoCount}/${person.targetTotal}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {selected.people.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatMoney(selected.totalSar, 'SAR')}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
