import { formatMoney, formatYearMonth } from '@/lib/format'
import type { PaymentArchivePerson } from '@/lib/payment-archive'
import { MoneyPair } from '@/components/admin/money-pair'
import { participantRoleLabel } from '@/lib/participant-role'

export function PaymentArchive({
  month,
  locale,
  people,
  labels,
}: {
  month: string
  locale: string
  people: PaymentArchivePerson[]
  labels: {
    card: string
    empty: string
    finished: string
    open: string
    videos: string
  }
}) {
  const monthName = formatYearMonth(month, locale).replace(/ \d{4}$/, '').replace(/ \d{4}$/, '')
  const heading =
    locale === 'ar' ? `${labels.card} ${monthName}` : `${monthName}'s ${labels.card}`
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-base font-semibold">{heading}</h3>
        {people.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {people.map((person) => (
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
      </section>
      {people.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatMoney(
            people.reduce((sum, person) => sum + person.paidSar, 0),
            'SAR',
          )}
        </p>
      ) : null}
    </div>
  )
}
