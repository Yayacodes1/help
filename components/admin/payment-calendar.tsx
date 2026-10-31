import Link from 'next/link'
import { formatMoney, formatYearMonth } from '@/lib/format'
import type { CalendarPayStatus, PaymentCalendarModel } from '@/lib/payment-calendar'
import { PaymentCalendarNav } from '@/components/admin/payment-calendar-nav'
import { StatCard } from '@/components/stat-card'

const STATUS_CLASS: Record<CalendarPayStatus, string> = {
  paid: 'bg-emerald-500',
  partial: 'bg-sky-500',
  due: 'bg-amber-500',
  overdue: 'bg-destructive',
  scheduled: 'bg-muted-foreground/50',
}

function statusDot(status: CalendarPayStatus) {
  return <span className={`inline-block size-1.5 rounded-full ${STATUS_CLASS[status]}`} title={status} />
}

export function PaymentCalendarBoard({
  model,
  locale,
  labels,
}: {
  model: PaymentCalendarModel
  locale: string
  labels: {
    prev: string
    next: string
    today: string
    creators: string
    reposters: string
    both: string
    spent: string
    remaining: string
    commission: string
    earned: string
    weekdays: string[]
    unscheduled: string
    empty: string
    people: string
  }
}) {
  const hrefFor = (date: string) => {
    const q = new URLSearchParams()
    q.set('calMonth', model.month)
    if (model.role !== 'all') q.set('calRole', model.role)
    return `/admin/payments/${date}?${q.toString()}`
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentCalendarNav
        month={model.month}
        todayMonth={model.today.slice(0, 7)}
        role={model.role}
        labels={{
          prev: labels.prev,
          next: labels.next,
          today: labels.today,
          creators: labels.creators,
          reposters: labels.reposters,
          both: labels.both,
        }}
      />
      <h3 className="text-lg font-semibold tracking-tight">{formatYearMonth(model.month, locale)}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={labels.commission}
          value={formatMoney(model.commissionEarnedSar, 'SAR')}
          hint={`${labels.earned} · ${formatYearMonth(model.month, locale)}`}
        />
        <StatCard
          label={labels.spent}
          value={formatMoney(model.spentSar, 'SAR')}
          hint={`${labels.remaining}: ${formatMoney(model.remainingScheduledSar, 'SAR')} · ${formatYearMonth(model.month, locale)}`}
        />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {labels.weekdays.map((day) => (
          <div key={day} className="px-1 py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {model.days.map((day) => {
          if (!day.inMonth) {
            return <div key={day.date} className="min-h-20 rounded-lg bg-muted/20" />
          }
          return (
            <Link
              key={day.date}
              href={hrefFor(day.date)}
              className={`flex min-h-[4.25rem] flex-col gap-0.5 rounded-lg border p-1 text-left text-[11px] transition-colors hover:border-primary/50 hover:bg-accent sm:min-h-24 sm:p-2 sm:text-xs ${
                day.isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`tabular-nums ${day.isToday ? 'font-bold' : 'font-medium'}`}>
                  {Number(day.date.slice(8))}
                </span>
                <span className="flex gap-0.5">{day.statuses.map((s) => <span key={s}>{statusDot(s)}</span>)}</span>
              </div>
              {day.recipientCount > 0 ? (
                <>
                  <div className="truncate tabular-nums font-semibold">{formatMoney(day.scheduledSar, 'SAR')}</div>
                  <div className="text-[10px] leading-tight text-muted-foreground">
                    {day.recipientCount} {labels.people}
                    {day.creators ? ` · C${day.creators}` : ''}
                    {day.reposters ? ` · R${day.reposters}` : ''}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-muted-foreground/70">—</div>
              )}
            </Link>
          )
        })}
      </div>
      {model.unscheduled.length > 0 || model.undated.length > 0 ? (
        <section className="rounded-xl border border-dashed border-border p-4">
          <h4 className="text-sm font-semibold">{labels.unscheduled}</h4>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {model.undated.map((row) => (
              <li key={row.key} className="flex flex-wrap justify-between gap-2">
                <span>
                  {row.creatorName} · {row.contractName} · {row.installmentLabel}
                </span>
                <span className="tabular-nums">{formatMoney(row.dueAmountSar, 'SAR')}</span>
              </li>
            ))}
            {model.unscheduled.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {row.creatorName} · {row.paidOn}
                </span>
                <span className="tabular-nums">{formatMoney(row.leftoverSar, 'SAR')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {model.items.length === 0 && model.unscheduled.length === 0 && model.undated.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : null}
    </div>
  )
}
