import Link from 'next/link'
import { formatMoney, formatYearMonth } from '@/lib/format'
import type { PaymentCalendarModel } from '@/lib/payment-calendar'
import type { PayUrgency } from '@/lib/payment-calendar-math'
import { PaymentCalendarNav } from '@/components/admin/payment-calendar-nav'
import { StatCard } from '@/components/stat-card'
import { participantRoleLabel } from '@/lib/participant-role'

const URGENCY_CLASS: Record<PayUrgency, string> = {
  urgent: 'border-red-600 bg-red-600 text-white hover:brightness-110',
  soon: 'border-orange-500 bg-orange-500 text-white hover:brightness-110',
  safe: 'border-emerald-600 bg-emerald-600 text-white hover:brightness-110',
  none: 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent',
}

function compactSar(n: number): string {
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < 0.009) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(rounded)
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
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
    total: string
    totalHint: string
    scheduled: string
    weekdays: string[]
    unscheduled: string
    empty: string
    people: string
    rule: string
    legendUrgent: string
    legendSoon: string
    legendSafe: string
    paid: string
    toPay: string
  }
}) {
  const hrefFor = (date: string) => {
    const q = new URLSearchParams()
    q.set('calMonth', model.month)
    if (model.role !== 'all') q.set('calRole', model.role)
    return `/admin/payments/${date}?${q.toString()}`
  }
  const unpaid = [...model.items.filter((i) => i.remainingSar > 0.009)].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.creatorName.localeCompare(b.creatorName),
  )
  const monthLabel = formatYearMonth(model.month, locale)

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
      <h3 className="text-lg font-semibold tracking-tight">{monthLabel}</h3>
      <p className="text-sm text-muted-foreground">{labels.rule}</p>
      <div className="grid gap-3 lg:grid-cols-3">
        <StatCard
          label={labels.total}
          value={formatMoney(model.remainingScheduledSar, 'SAR')}
          hint={`${labels.totalHint} · ${monthLabel} · ${labels.scheduled}: ${formatMoney(model.scheduledTotalSar, 'SAR')}`}
        />
        <StatCard
          label={labels.commission}
          value={formatMoney(model.commissionEarnedSar, 'SAR')}
          hint={`${labels.earned} · ${monthLabel}`}
        />
        <StatCard
          label={labels.spent}
          value={formatMoney(model.spentSar, 'SAR')}
          hint={`${labels.remaining}: ${formatMoney(model.remainingScheduledSar, 'SAR')} · ${monthLabel}`}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-red-600" />
          {labels.legendUrgent}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-orange-500" />
          {labels.legendSoon}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-600" />
          {labels.legendSafe}
        </span>
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
            return <div key={day.date} className="min-h-16 rounded-lg bg-muted/20 sm:min-h-28" />
          }
          const showPay = day.remainingSar > 0.009
          const paidOff = day.recipientCount > 0 && !showPay
          return (
            <Link
              key={day.date}
              href={hrefFor(day.date)}
              className={`flex min-h-16 flex-col rounded-lg border p-1 text-left sm:min-h-28 sm:p-2 ${
                URGENCY_CLASS[day.urgency]
              } ${day.isToday ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : ''}`}
            >
              <span className={`tabular-nums text-xs ${day.isToday ? 'font-bold' : 'font-medium'}`}>
                {Number(day.date.slice(8))}
              </span>
              {showPay ? (
                <>
                  <div className="mt-0.5 text-base font-bold leading-none tabular-nums sm:text-xl">
                    {compactSar(day.remainingSar)}
                  </div>
                  <div className="mt-1 hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden text-[10px] leading-tight sm:flex">
                    {day.names.slice(0, 3).map((name) => (
                      <span key={name} className="truncate">
                        {name}
                      </span>
                    ))}
                    {day.names.length > 3 ? <span>+{day.names.length - 3}</span> : null}
                  </div>
                  <div className="mt-auto pt-0.5 text-[10px] font-medium sm:hidden">
                    {day.unpaidCount}
                  </div>
                </>
              ) : paidOff ? (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  {labels.paid}
                </div>
              ) : (
                <div className="mt-1 text-[10px] opacity-40">—</div>
              )}
            </Link>
          )
        })}
      </div>
      {unpaid.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold">
            {labels.toPay} · {unpaid.length}
          </h4>
          <ul className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto text-sm">
            {unpaid.map((row) => (
              <li key={row.key}>
                <Link
                  href={hrefFor(row.dueDate)}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{row.creatorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}
                      {participantRoleLabel(row.role)}
                      {' · '}
                      {row.installmentLabel}
                      {' · '}
                      {row.dueDate}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold">{formatMoney(row.remainingSar, 'SAR')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
