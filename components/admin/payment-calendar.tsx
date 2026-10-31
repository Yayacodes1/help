import Link from 'next/link'
import { formatMoney, formatYearMonth } from '@/lib/format'
import type { PaymentCalendarModel } from '@/lib/payment-calendar'
import type { PayUrgency } from '@/lib/payment-calendar-math'
import { MoneyPair } from '@/components/admin/money-pair'
import { PushContractForward } from '@/components/admin/push-contract-forward'
import { PaymentCalendarNav } from '@/components/admin/payment-calendar-nav'
import { StatCard } from '@/components/stat-card'
import { participantRoleLabel } from '@/lib/participant-role'

const URGENCY_CLASS: Record<PayUrgency, string> = {
  urgent: 'border-red-600 bg-red-600 text-white hover:brightness-110',
  soon: 'border-orange-500 bg-orange-500 text-white hover:brightness-110',
  safe: 'border-emerald-600 bg-emerald-600 text-white hover:brightness-110',
  none: 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent',
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
    videos: string
    moreTime: string
    moreTimeHint: string
    pushing: string
    customDays: string
    addDays: string
  }
}) {
  const hrefFor = (date: string) => {
    const q = new URLSearchParams()
    q.set('calMonth', model.month)
    if (model.role !== 'all') q.set('calRole', model.role)
    return `/admin/payments/${date}?${q.toString()}`
  }
  const unpaidRows = model.items.filter((i) => i.remainingSar > 0.009)
  const people = new Map<
    number,
    {
      creatorId: number
      creatorName: string
      role: (typeof unpaidRows)[number]['role']
      remainingSar: number
      nextDue: string
      count: number
      contractId: number
      contractEnd: string | null
      awaitingEligibility: boolean
      videoCount: number
      targetTotal: number
    }
  >()
  for (const row of unpaidRows) {
    const existing = people.get(row.creatorId)
    if (!existing) {
      people.set(row.creatorId, {
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        role: row.role,
        remainingSar: row.remainingSar,
        nextDue: row.dueDate,
        count: 1,
        contractId: row.contractId,
        contractEnd: row.contractEnd,
        awaitingEligibility: row.awaitingEligibility,
        videoCount: row.videoCount,
        targetTotal: row.targetTotal,
      })
    } else {
      existing.remainingSar += row.remainingSar
      existing.count += 1
      if (row.dueDate < existing.nextDue) {
        existing.nextDue = row.dueDate
        existing.contractId = row.contractId
        existing.contractEnd = row.contractEnd
        existing.awaitingEligibility = row.awaitingEligibility
        existing.videoCount = row.videoCount
        existing.targetTotal = row.targetTotal
      }
    }
  }
  const unpaid = [...people.values()].sort(
    (a, b) => a.nextDue.localeCompare(b.nextDue) || a.creatorName.localeCompare(b.creatorName),
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
          value={<MoneyPair sar={model.remainingScheduledSar} usd={model.remainingScheduledUsd} />}
          hint={`${labels.totalHint} · ${monthLabel} · ${labels.scheduled}: ${formatMoney(model.scheduledTotalSar, 'SAR')}  ${formatMoney(model.scheduledTotalUsd, 'USD')}`}
        />
        <StatCard
          label={labels.commission}
          value={<MoneyPair sar={model.commissionEarnedSar} />}
          hint={`${labels.earned} · ${monthLabel}`}
        />
        <StatCard
          label={labels.spent}
          value={<MoneyPair sar={model.spentSar} usd={model.spentUsd} />}
          hint={`${labels.remaining}: ${formatMoney(model.remainingScheduledSar, 'SAR')}  ${formatMoney(model.remainingScheduledUsd, 'USD')} · ${monthLabel}`}
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
                  <div className="mt-0.5 leading-tight">
                    <MoneyPair sar={day.remainingSar} usd={day.remainingUsd} big tone="inherit" />
                  </div>
                  <div className="mt-1 hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden text-[10px] leading-tight sm:flex">
                    {day.names.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="truncate rounded-sm bg-zinc-200 px-1 font-semibold text-zinc-900"
                      >
                        {name}
                      </span>
                    ))}
                    {day.names.length > 3 ? (
                      <span className="truncate rounded-sm bg-zinc-200 px-1 font-semibold text-zinc-900">
                        +{day.names.length - 3}
                      </span>
                    ) : null}
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
          <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-auto text-sm">
            {unpaid.map((row) => (
              <li
                key={row.creatorId}
                className="rounded-lg border border-zinc-300 bg-zinc-200 px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={hrefFor(row.nextDue)} className="min-w-0">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">{row.creatorName}</span>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {' · '}
                      {participantRoleLabel(row.role)}
                      {' · '}
                      {row.nextDue}
                      {row.count > 1 ? ` · ${row.count}` : ''}
                      {row.targetTotal > 0
                        ? ` · ${labels.videos} ${row.videoCount}/${row.targetTotal}`
                        : ''}
                    </span>
                  </Link>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                    <MoneyPair sar={row.remainingSar} />
                  </span>
                </div>
                {row.contractEnd ? (
                  <div className="mt-1">
                    {row.awaitingEligibility ? (
                      <p className="mb-1 text-[10px] font-medium text-zinc-700 dark:text-zinc-200">
                        {labels.moreTimeHint}
                      </p>
                    ) : null}
                    <PushContractForward
                      creatorId={row.creatorId}
                      contractId={row.contractId}
                      contractEnd={row.contractEnd}
                      compact
                      labels={{
                        moreTime: labels.moreTime,
                        hint: labels.moreTimeHint,
                        pushing: labels.pushing,
                        custom: labels.customDays,
                        add: labels.addDays,
                      }}
                    />
                  </div>
                ) : null}
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
                <MoneyPair sar={row.dueAmountSar} />
              </li>
            ))}
            {model.unscheduled.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {row.creatorName} · {row.paidOn}
                </span>
                <MoneyPair sar={row.leftoverSar} />
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
