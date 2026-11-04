'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMoney, formatNumber, formatYearMonth } from '@/lib/format'
import { addDays } from '@/lib/campaign'
import type {
  CalendarDayCell,
  CalendarRoleFilter,
  PaymentCalendarModel,
  SettledObligation,
} from '@/lib/payment-calendar'
import { daysAhead, type PayUrgency } from '@/lib/payment-calendar-math'
import { MoneyPair } from '@/components/admin/money-pair'
import { PushContractForward } from '@/components/admin/push-contract-forward'
import { PaymentCalendarNav } from '@/components/admin/payment-calendar-nav'
import { CalendarPayEdit } from '@/components/admin/calendar-pay-edit'
import { StatCard } from '@/components/stat-card'
import { participantRoleLabel, type ParticipantRole } from '@/lib/participant-role'

const URGENCY_CLASS: Record<PayUrgency, string> = {
  urgent: 'border-red-600 bg-red-600 text-white hover:brightness-110',
  soon: 'border-orange-500 bg-orange-500 text-white hover:brightness-110',
  safe: 'border-emerald-600 bg-emerald-600 text-white hover:brightness-110',
  none: 'border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent',
}

const PAID_CLASS = 'border-blue-600 bg-blue-600 text-white hover:brightness-110'

/** Selected days must read clearly on top of red/orange/green cells. */
const SELECTED_CLASS =
  'border-zinc-950 bg-zinc-950 text-white shadow-md ring-2 ring-zinc-950 ring-offset-2 ring-offset-background hover:brightness-100'

function sameDateSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false
  return b.every((date) => a.has(date))
}

type PayPersonRow = {
  creatorId: number
  creatorName: string
  role: ParticipantRole
  projectName: string | null
  remainingSar: number
  nextDue: string
  count: number
  contractId: number
  contractEnd: string | null
  installmentIndex: number
  dueAmount: number
  currency: string
  awaitingEligibility: boolean
  videoCount: number
  targetTotal: number
}

type SelectionPerson = {
  creatorId: number
  creatorName: string
  role: ParticipantRole
  remainingSar: number
  days: number
}

function matchesRoleFilter(item: SettledObligation, role: CalendarRoleFilter): boolean {
  if (role === 'all') return true
  if (role === 'company') return item.creatorId < 0 || item.role === 'reposter'
  if (item.creatorId < 0) return false
  return item.role === role
}

function unpaidItemsOnDay(day: CalendarDayCell, role: CalendarRoleFilter = 'all'): SettledObligation[] {
  return day.items.filter((item) => item.remainingSar > 0.009 && matchesRoleFilter(item, role))
}

function dayRemainingForRole(day: CalendarDayCell, role: CalendarRoleFilter): number {
  if (role === 'all') return day.remainingSar
  return unpaidItemsOnDay(day, role).reduce((sum, item) => sum + item.remainingSar, 0)
}

function sumRange(
  days: CalendarDayCell[],
  from: string,
  to: string,
  role: CalendarRoleFilter = 'all',
): { sar: number; usd: number; dates: string[] } {
  let sar = 0
  let usd = 0
  const dates: string[] = []
  for (const day of days) {
    if (!day.inMonth) continue
    if (day.date < from || day.date > to) continue
    const remaining = dayRemainingForRole(day, role)
    if (remaining <= 0.009) continue
    sar += remaining
    const share = day.remainingSar > 0 ? remaining / day.remainingSar : 0
    usd += day.remainingUsd * share
    dates.push(day.date)
  }
  return { sar, usd, dates }
}

function peopleFromDates(
  days: CalendarDayCell[],
  selected: Set<string>,
  role: CalendarRoleFilter = 'all',
): { people: SelectionPerson[]; sar: number } {
  const map = new Map<number, SelectionPerson>()
  let sar = 0
  for (const day of days) {
    if (!selected.has(day.date)) continue
    for (const item of unpaidItemsOnDay(day, role)) {
      sar += item.remainingSar
      const existing = map.get(item.creatorId)
      if (!existing) {
        map.set(item.creatorId, {
          creatorId: item.creatorId,
          creatorName: item.creatorName,
          role: item.role,
          remainingSar: item.remainingSar,
          days: 1,
        })
      } else {
        existing.remainingSar += item.remainingSar
        existing.days += 1
      }
    }
  }
  const people = [...map.values()].sort(
    (a, b) => a.role.localeCompare(b.role) || a.creatorName.localeCompare(b.creatorName),
  )
  return { people, sar }
}

function PayPeople({
  title,
  rows,
  open = false,
  hrefFor,
  labels,
}: {
  title: string
  open?: boolean
  hrefFor: (date: string) => string
  rows: PayPersonRow[]
  labels: {
    editPay: string
    when: string
    save: string
    cancel: string
    saving: string
    videos: string
    moreTime: string
    moreTimeHint: string
    pushing: string
    customDays: string
    addDays: string
  }
}) {
  if (rows.length === 0) return null
  return (
    <details open={open || undefined} className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold">{title}</summary>
      <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-auto text-sm">
        {rows.map((row) => (
          <li key={row.creatorId} className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-accent/40">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={hrefFor(row.nextDue)} className="min-w-0">
                <span className="font-medium">{row.creatorName}</span>
                <span className="text-xs text-muted-foreground">
                  {' · '}
                  {row.creatorId < 0 && row.projectName
                    ? row.projectName
                    : participantRoleLabel(row.role)}
                  {' · '}
                  {row.nextDue}
                  {row.count > 1 ? ` · ${row.count}` : ''}
                  {row.targetTotal > 0 ? ` · ${labels.videos} ${row.videoCount}/${row.targetTotal}` : ''}
                </span>
              </Link>
              <MoneyPair sar={row.remainingSar} />
            </div>
            <CalendarPayEdit
              creatorId={row.creatorId}
              contractId={row.contractId}
              installmentIndex={row.installmentIndex}
              dueOn={row.nextDue}
              amount={row.dueAmount}
              currency={row.currency}
              labels={{
                edit: labels.editPay,
                when: labels.when,
                save: labels.save,
                cancel: labels.cancel,
                saving: labels.saving,
              }}
            />
            {row.contractEnd && row.creatorId > 0 ? (
              <div className="mt-1">
                {row.awaitingEligibility ? (
                  <p className="mb-1 text-[10px] text-muted-foreground">{labels.moreTimeHint}</p>
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
    </details>
  )
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
    company: string
    all: string
    spent: string
    remaining: string
    commission: string
    earned: string
    reposterCommissionHint: string
    views: string
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
    expense: string
    expenseHint: string
    still: string
    nextBooked: string
    thisWeek: string
    later: string
    legendPaid: string
    toPay: string
    editPay: string
    when: string
    save: string
    cancel: string
    saving: string
    videos: string
    moreTime: string
    moreTimeHint: string
    pushing: string
    customDays: string
    addDays: string
    owedPresets: string
    next15: string
    monthStartEnd: string
    todayToEnd: string
    pickDays: string
    selected: string
    clearSelection: string
    paying: string
    openDay: string
    noSelection: string
    pickDate: string
    from: string
    to: string
    applyRange: string
    addDay: string
  }
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [rangeFrom, setRangeFrom] = useState(model.today)
  const [rangeTo, setRangeTo] = useState(addDays(model.today, 14))
  const [pickOne, setPickOne] = useState(model.today)
  /** Local filter for owed totals / selection; follows page role when that page is already filtered. */
  const [pickRole, setPickRole] = useState<CalendarRoleFilter>(model.role)

  const hrefFor = (date: string) => {
    const q = new URLSearchParams()
    q.set('calMonth', model.month)
    if (model.role !== 'all') q.set('calRole', model.role)
    return `/admin/payments/${date}?${q.toString()}`
  }

  const roleFilter = model.role !== 'all' ? model.role : pickRole

  const next15 = useMemo(
    () => sumRange(model.days, model.today, addDays(model.today, 14), roleFilter),
    [model.days, model.today, roleFilter],
  )
  const monthFull = useMemo(
    () => sumRange(model.days, model.start, model.end, roleFilter),
    [model.days, model.start, model.end, roleFilter],
  )
  const todayToEnd = useMemo(
    () => sumRange(model.days, model.today, model.end, roleFilter),
    [model.days, model.today, model.end, roleFilter],
  )

  const selection = useMemo(
    () => peopleFromDates(model.days, selected, roleFilter),
    [model.days, selected, roleFilter],
  )
  const next15Active = sameDateSet(selected, next15.dates)
  const monthFullActive = sameDateSet(selected, monthFull.dates)
  const todayToEndActive = sameDateSet(selected, todayToEnd.dates)

  function applyPreset(dates: string[]) {
    setSelected(new Set(dates))
  }

  function toggleDay(date: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function applyCustomRange() {
    const from = rangeFrom <= rangeTo ? rangeFrom : rangeTo
    const to = rangeFrom <= rangeTo ? rangeTo : rangeFrom
    const dates = sumRange(model.days, from, to, roleFilter).dates
    setSelected(new Set(dates))
  }

  function addPickedDay() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickOne)) return
    const day = model.days.find((d) => d.date === pickOne && d.inMonth)
    const remaining = day ? dayRemainingForRole(day, roleFilter) : 0
    if (!day || remaining <= 0.009) {
      setSelected((prev) => new Set(prev).add(pickOne))
      return
    }
    toggleDay(pickOne)
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const roleToggleClass = (active: boolean) =>
    `rounded-md px-2.5 py-1.5 text-xs font-medium sm:text-sm ${
      active ? 'bg-zinc-950 text-white' : 'text-muted-foreground hover:bg-accent'
    }`

  const unpaidRows = model.items.filter((i) => i.remainingSar > 0.009)
  const people = new Map<number, PayPersonRow>()
  for (const row of unpaidRows) {
    const existing = people.get(row.creatorId)
    if (!existing) {
      people.set(row.creatorId, {
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        role: row.role,
        projectName: row.projectName,
        remainingSar: row.remainingSar,
        nextDue: row.dueDate,
        count: 1,
        contractId: row.contractId,
        contractEnd: row.contractEnd,
        installmentIndex: row.installmentIndex,
        dueAmount: row.dueAmount,
        currency: row.currency,
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
        existing.installmentIndex = row.installmentIndex
        existing.dueAmount = row.dueAmount
        existing.currency = row.currency
        existing.awaitingEligibility = row.awaitingEligibility
        existing.videoCount = row.videoCount
        existing.targetTotal = row.targetTotal
      }
    }
  }
  const unpaid = [...people.values()].sort(
    (a, b) => a.nextDue.localeCompare(b.nextDue) || a.creatorName.localeCompare(b.creatorName),
  )
  const dueSoon = unpaid.filter((row) => daysAhead(model.today, row.nextDue) <= 7)
  const dueLater = unpaid.filter((row) => daysAhead(model.today, row.nextDue) > 7)
  const monthLabel = formatYearMonth(model.month, locale)

  const creatorsPay = selection.people.filter((p) => p.role === 'creator' && p.creatorId > 0)
  const repostersPay = selection.people.filter((p) => p.role === 'reposter')
  const companyPay = selection.people.filter((p) => p.creatorId < 0)

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
          company: labels.company,
          all: labels.all,
        }}
      />
      <h3 className="text-lg font-semibold tracking-tight">{monthLabel}</h3>
      <p className="text-sm text-muted-foreground">{labels.rule}</p>
      <div className="grid gap-3 lg:grid-cols-3">
        <StatCard
          label={labels.expense}
          value={<MoneyPair sar={model.expenseSar} usd={model.expenseUsd} />}
          hint={`${labels.expenseHint} · ${labels.paid} ${formatMoney(model.spentSar, 'SAR')} ${formatMoney(model.spentUsd, 'USD')} · ${labels.still} ${formatMoney(model.remainingScheduledSar, 'SAR')} ${formatMoney(model.remainingScheduledUsd, 'USD')}`}
        />
        <StatCard
          label={labels.commission}
          value={<MoneyPair sar={model.commissionEarnedSar} />}
          hint={
            model.role === 'reposter'
              ? labels.reposterCommissionHint
              : `${labels.earned} · ${monthLabel}`
          }
        />
        <StatCard
          label={labels.nextBooked}
          value={<MoneyPair sar={model.nextScheduledSar} usd={model.nextScheduledUsd} />}
          hint={model.nextMonth ? formatYearMonth(model.nextMonth, locale) : ''}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold">{labels.owedPresets}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{labels.pickDays}</p>

        {model.role === 'all' ? (
          <div className="mt-3 inline-flex flex-wrap rounded-lg border border-border p-0.5">
            {(
              [
                { id: 'all' as const, label: labels.all },
                { id: 'creator' as const, label: labels.creators },
                { id: 'reposter' as const, label: labels.reposters },
                { id: 'company' as const, label: labels.company },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setPickRole(opt.id)
                  setSelected(new Set())
                }}
                className={roleToggleClass(pickRole === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(
            [
              { key: 'next15', label: labels.next15, data: next15, active: next15Active },
              { key: 'month', label: labels.monthStartEnd, data: monthFull, active: monthFullActive },
              { key: 'todayEnd', label: labels.todayToEnd, data: todayToEnd, active: todayToEndActive },
            ] as const
          ).map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.data.dates)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                preset.active
                  ? 'border-zinc-950 bg-zinc-950 text-white shadow-md'
                  : 'border-border hover:border-primary/50 hover:bg-accent/40'
              }`}
            >
              <div
                className={`text-xs font-semibold ${
                  preset.active ? 'text-white/80' : 'text-muted-foreground'
                }`}
              >
                {preset.label}
                {preset.active ? ' · ✓' : ''}
              </div>
              <div className={`mt-1 ${preset.active ? '[&_span]:text-white' : ''}`}>
                <MoneyPair sar={preset.data.sar} usd={preset.data.usd} />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.from}
            <input
              type="date"
              value={rangeFrom}
              min={model.start}
              max={model.end}
              onChange={(e) => setRangeFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.to}
            <input
              type="date"
              value={rangeTo}
              min={model.start}
              max={model.end}
              onChange={(e) => setRangeTo(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={applyCustomRange}
              className="h-9 w-full rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800 sm:w-auto"
            >
              {labels.applyRange}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {labels.pickDate}
            <input
              type="date"
              value={pickOne}
              min={model.start}
              max={model.end}
              onChange={(e) => setPickOne(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={addPickedDay}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
          >
            {labels.addDay}
          </button>
        </div>
      </section>

      {model.role === 'reposter' && model.reposterCommission.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-auto rounded-xl border border-border bg-card p-3">
          {model.reposterCommission.map((row) => (
            <li key={row.creatorId} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatNumber(row.views)} {labels.views}
              </span>
              <span className="shrink-0 text-right">
                <MoneyPair sar={row.sar} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
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
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-blue-600" />
          {labels.legendPaid}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="min-w-0">
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
              const roleItems = unpaidItemsOnDay(day, roleFilter)
              const roleRemaining = dayRemainingForRole(day, roleFilter)
              const showPay = roleRemaining > 0.009
              const paidOff = day.recipientCount > 0 && day.remainingSar <= 0.009
              const isSelected = selected.has(day.date)
              const baseTone = paidOff ? PAID_CLASS : URGENCY_CLASS[day.urgency]
              const roleNames = [...new Set(roleItems.map((item) => item.creatorName))]
              const roleUsd =
                day.remainingSar > 0 ? day.remainingUsd * (roleRemaining / day.remainingSar) : 0
              return (
                <div
                  key={day.date}
                  className={`relative flex min-h-16 flex-col rounded-lg border p-1 text-left sm:min-h-28 sm:p-2 ${
                    isSelected ? SELECTED_CLASS : baseTone
                  } ${!isSelected && day.isToday ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (showPay || isSelected) toggleDay(day.date)
                    }}
                    disabled={!showPay && !isSelected}
                    className="flex min-h-0 flex-1 flex-col text-left disabled:cursor-default"
                  >
                    <span
                      className={`flex items-center justify-between gap-1 tabular-nums text-xs ${
                        day.isToday || isSelected ? 'font-bold' : 'font-medium'
                      }`}
                    >
                      <span>{Number(day.date.slice(8))}</span>
                      {isSelected ? (
                        <span className="rounded bg-white/20 px-1 text-[10px] font-bold uppercase tracking-wide">
                          On
                        </span>
                      ) : null}
                    </span>
                    {showPay ? (
                      <>
                        <div className="mt-0.5 leading-tight">
                          <MoneyPair sar={roleRemaining} usd={roleUsd} big tone="inherit" />
                        </div>
                        <div className="mt-1 hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden text-[10px] leading-tight sm:flex">
                          {roleNames.slice(0, 3).map((name) => (
                            <span key={name} className="truncate">
                              {name}
                            </span>
                          ))}
                          {roleNames.length > 3 ? <span>+{roleNames.length - 3}</span> : null}
                        </div>
                        <div className="mt-auto pt-0.5 text-[10px] font-medium sm:hidden">
                          {roleItems.length}
                        </div>
                      </>
                    ) : paidOff ? (
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                        {labels.paid}
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] opacity-40">—</div>
                    )}
                  </button>
                  {showPay || paidOff ? (
                    <Link
                      href={hrefFor(day.date)}
                      className={`mt-1 text-[10px] font-medium underline-offset-2 hover:underline ${
                        isSelected ? 'text-white/90' : ''
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {labels.openDay}
                    </Link>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">{labels.selected}</h4>
              <p className="text-xs text-muted-foreground">
                {selected.size === 0
                  ? labels.noSelection
                  : `${selected.size} day${selected.size === 1 ? '' : 's'}`}
              </p>
            </div>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {labels.clearSelection}
              </button>
            ) : null}
          </div>
          <div className="mt-3">
            <MoneyPair sar={selection.sar} big />
          </div>
          {selection.people.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{labels.pickDays}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.paying}
              </p>
              {(
                [
                  { title: labels.creators, rows: creatorsPay },
                  { title: labels.reposters, rows: repostersPay },
                  { title: labels.company, rows: companyPay },
                ] as const
              ).map((group) =>
                group.rows.length === 0 ? null : (
                  <div key={group.title}>
                    <p className="mb-1 text-xs font-medium">{group.title}</p>
                    <ul className="flex flex-col gap-1.5">
                      {group.rows.map((person) => (
                        <li
                          key={person.creatorId}
                          className="flex items-baseline justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate font-medium">{person.creatorName}</span>
                          <MoneyPair sar={person.remainingSar} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </aside>
      </div>

      {unpaid.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold">
            {labels.toPay} · {unpaid.length}
          </h4>
          <PayPeople
            title={`${labels.thisWeek} · ${dueSoon.length}`}
            rows={dueSoon}
            open
            hrefFor={hrefFor}
            labels={labels}
          />
          {dueLater.length > 0 ? (
            <PayPeople
              title={`${labels.later} · ${dueLater.length}`}
              rows={dueLater}
              hrefFor={hrefFor}
              labels={labels}
            />
          ) : null}
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
