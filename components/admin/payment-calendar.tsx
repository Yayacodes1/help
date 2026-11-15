'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMoney, formatNumber, formatWeekdayDate, formatYearMonth } from '@/lib/format'
import { addDays, calendarMonthRange } from '@/lib/campaign'
import {
  monthGridDates,
  type CalendarDayCell,
  type CalendarRoleFilter,
  type PaymentCalendarModel,
  type SettledObligation,
} from '@/lib/payment-calendar'
import {
  daysAhead,
  payLineCategory,
  roundMoney,
  type PayLineCategory,
  type PayUrgency,
} from '@/lib/payment-calendar-math'
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

function categoryLabel(
  id: PayLineCategory,
  labels: { creators: string; reposters: string; management: string },
): string {
  if (id === 'management') return labels.management
  if (id === 'reposters') return labels.reposters
  return labels.creators
}

function shortDay(value: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [year, month, day] = value.split('-').map(Number)
  const loc = locale === 'ar' || locale.startsWith('ar') ? 'ar' : 'en-US'
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(loc, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function paySpan(model: PaymentCalendarModel): CalendarDayCell[] {
  return model.spanDays.length > 0 ? model.spanDays : model.days.filter((day) => day.inMonth)
}

type DayPayPerson = { creatorId: number; name: string; sar: number }
type DayPayCategory = { id: PayLineCategory; sar: number; usd: number; people: DayPayPerson[] }
type DayPayRow = { date: string; sar: number; usd: number; categories: DayPayCategory[] }

function buildDayPayRows(
  days: CalendarDayCell[],
  selected: Set<string>,
  role: CalendarRoleFilter,
): { rows: DayPayRow[]; totals: Record<PayLineCategory, number> & { sar: number; usd: number } } {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const totals = { creators: 0, reposters: 0, management: 0, sar: 0, usd: 0 }
  const rows: DayPayRow[] = []
  for (const date of [...selected].sort()) {
    const day = byDate.get(date)
    if (!day) continue
    const items = unpaidItemsOnDay(day, role)
    if (items.length === 0) continue
    const buckets = new Map<PayLineCategory, Map<number, DayPayPerson>>()
    let sar = 0
    for (const item of items) {
      sar += item.remainingSar
      const id = payLineCategory(item.creatorId, item.role)
      const people = buckets.get(id) ?? new Map<number, DayPayPerson>()
      const name =
        item.creatorId < 0 && item.projectName && item.projectName !== item.creatorName
          ? `${item.creatorName} · ${item.projectName}`
          : item.creatorName
      const existing = people.get(item.creatorId)
      if (existing) existing.sar += item.remainingSar
      else people.set(item.creatorId, { creatorId: item.creatorId, name, sar: item.remainingSar })
      buckets.set(id, people)
    }
    sar = roundMoney(sar)
    const usd = day.remainingSar > 0 ? roundMoney(day.remainingUsd * (sar / day.remainingSar)) : 0
    const categories: DayPayCategory[] = []
    for (const id of ['creators', 'reposters', 'management'] as const) {
      const peopleMap = buckets.get(id)
      if (!peopleMap) continue
      const people = [...peopleMap.values()]
        .map((person) => ({ ...person, sar: roundMoney(person.sar) }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const catSar = roundMoney(people.reduce((sum, person) => sum + person.sar, 0))
      const catUsd = sar > 0 ? roundMoney(usd * (catSar / sar)) : 0
      totals[id] = roundMoney(totals[id] + catSar)
      categories.push({ id, sar: catSar, usd: catUsd, people })
    }
    totals.sar = roundMoney(totals.sar + sar)
    totals.usd = roundMoney(totals.usd + usd)
    rows.push({ date, sar, usd, categories })
  }
  return { rows, totals }
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

function PayRangeCalendar({
  spanDays,
  payable,
  weekdays,
  locale,
  today,
  from,
  to,
  onApply,
  onClose,
  labels,
}: {
  spanDays: CalendarDayCell[]
  payable: Set<string>
  weekdays: string[]
  locale: string
  today: string
  from: string
  to: string
  onApply: (from: string, to: string) => void
  onClose: () => void
  labels: { pickRange: string; showDays: string; prev: string; next: string }
}) {
  const months = useMemo(
    () => [...new Set(spanDays.map((day) => day.date.slice(0, 7)))].sort(),
    [spanDays],
  )
  const allowed = useMemo(() => new Set(spanDays.map((day) => day.date)), [spanDays])
  const [cursor, setCursor] = useState(
    months.includes(from.slice(0, 7)) ? from.slice(0, 7) : (months[0] ?? from.slice(0, 7)),
  )
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState<string | null>(to)
  const { start, end } = calendarMonthRange(cursor)
  const cells = monthGridDates(start, end)
  const index = months.indexOf(cursor)
  const rangeStart = !draftTo || draftFrom <= draftTo ? draftFrom : draftTo
  const rangeEnd = !draftTo || draftFrom <= draftTo ? (draftTo ?? draftFrom) : draftFrom

  function pick(date: string) {
    if (!draftFrom || draftTo) {
      setDraftFrom(date)
      setDraftTo(null)
      return
    }
    if (date < draftFrom) {
      setDraftTo(draftFrom)
      setDraftFrom(date)
    } else {
      setDraftTo(date)
    }
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-lg">
        <p className="text-xs text-muted-foreground">{labels.pickRange}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => setCursor(months[index - 1])}
            className="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
          >
            {labels.prev}
          </button>
          <span className="text-sm font-semibold">{formatYearMonth(cursor, locale)}</span>
          <button
            type="button"
            disabled={index < 0 || index >= months.length - 1}
            onClick={() => setCursor(months[index + 1])}
            className="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
          >
            {labels.next}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {weekdays.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((date) => {
            const inCursor = date >= start && date <= end
            if (!inCursor) return <div key={date} />
            const enabled = allowed.has(date)
            const chosen = enabled && date >= rangeStart && date <= rangeEnd
            return (
              <button
                key={date}
                type="button"
                disabled={!enabled}
                onClick={() => pick(date)}
                className={`flex h-8 flex-col items-center justify-center rounded-md text-xs tabular-nums ${
                  chosen
                    ? 'bg-zinc-950 font-semibold text-white'
                    : enabled
                      ? 'hover:bg-accent'
                      : 'text-muted-foreground/40'
                } ${date === today && !chosen ? 'ring-1 ring-foreground' : ''}`}
              >
                {Number(date.slice(8))}
                {payable.has(date) ? <span className="mt-0.5 block size-1 rounded-full bg-current" /> : null}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs font-medium">
          {shortDay(rangeStart, locale)}
          {rangeEnd !== rangeStart ? ` – ${shortDay(rangeEnd, locale)}` : ''}
        </p>
        <button
          type="button"
          onClick={() => onApply(rangeStart, rangeEnd)}
          className="mt-2 h-9 w-full rounded-lg bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {labels.showDays}
        </button>
      </div>
    </>
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
    next7: string
    next14: string
    comingMonth: string
    pickDays: string
    dayList: string
    dayListHint: string
    management: string
    nothingInRange: string
    customDates: string
    pickRange: string
    showDays: string
    rangeTotal: string
    selected: string
    clearSelection: string
    paying: string
    openDay: string
    noSelection: string
  }
}) {
  const [payFrom, setPayFrom] = useState(model.today)
  const [payTo, setPayTo] = useState(() => addDays(model.today, 6))
  const [preset, setPreset] = useState<'7' | '14' | '30' | 'custom'>('7')
  const [rangeOpen, setRangeOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => {
    const span = paySpan(model)
    return new Set(sumRange(span, model.today, addDays(model.today, 6), model.role).dates)
  })
  /** Local filter for owed totals / selection; follows page role when that page is already filtered. */
  const [pickRole, setPickRole] = useState<CalendarRoleFilter>(model.role)

  const hrefFor = (date: string) => {
    const q = new URLSearchParams()
    q.set('calMonth', date.slice(0, 7))
    if (model.role !== 'all') q.set('calRole', model.role)
    return `/admin/payments/${date}?${q.toString()}`
  }

  const roleFilter = model.role !== 'all' ? model.role : pickRole
  const spanDays = paySpan(model)

  const presets = useMemo(
    () =>
      [
        { key: '7' as const, label: labels.next7, data: sumRange(spanDays, model.today, addDays(model.today, 6), roleFilter) },
        { key: '14' as const, label: labels.next14, data: sumRange(spanDays, model.today, addDays(model.today, 13), roleFilter) },
        {
          key: '30' as const,
          label: labels.comingMonth,
          data: sumRange(spanDays, model.today, addDays(model.today, 29), roleFilter),
        },
      ],
    [spanDays, model.today, roleFilter, labels.next7, labels.next14, labels.comingMonth],
  )

  const selection = useMemo(
    () => peopleFromDates(spanDays, selected, roleFilter),
    [spanDays, selected, roleFilter],
  )
  const dayPay = useMemo(
    () => buildDayPayRows(spanDays, selected, roleFilter),
    [spanDays, selected, roleFilter],
  )
  const payableDates = useMemo(() => {
    const dates = new Set<string>()
    for (const day of spanDays) {
      if (dayRemainingForRole(day, roleFilter) > 0.009) dates.add(day.date)
    }
    return dates
  }, [spanDays, roleFilter])

  function applyWindow(from: string, to: string, nextPreset: '7' | '14' | '30' | 'custom') {
    const start = from <= to ? from : to
    const end = from <= to ? to : from
    setPayFrom(start)
    setPayTo(end)
    setPreset(nextPreset)
    setSelected(new Set(sumRange(spanDays, start, end, roleFilter).dates))
    setRangeOpen(false)
  }

  function toggleDay(date: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

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
                  const start = payFrom <= payTo ? payFrom : payTo
                  const end = payFrom <= payTo ? payTo : payFrom
                  setSelected(new Set(sumRange(spanDays, start, end, opt.id).dates))
                }}
                className={roleToggleClass(pickRole === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {presets.map((item) => {
            const active = preset === item.key && sameDateSet(selected, item.data.dates)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  const from = model.today
                  const to =
                    item.key === '7'
                      ? addDays(model.today, 6)
                      : item.key === '14'
                        ? addDays(model.today, 13)
                        : addDays(model.today, 29)
                  applyWindow(from, to, item.key)
                }}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-zinc-950 bg-zinc-950 text-white shadow-md'
                    : 'border-border hover:border-primary/50 hover:bg-accent/40'
                }`}
              >
                <div className={`text-xs font-semibold ${active ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {item.label}
                  {active ? ' · ✓' : ''}
                </div>
                <div className={`mt-1 ${active ? '[&_span]:text-white' : ''}`}>
                  <MoneyPair sar={item.data.sar} usd={item.data.usd} />
                </div>
              </button>
            )
          })}
        </div>

        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setRangeOpen((open) => !open)}
            className={`h-9 rounded-lg border px-3 text-sm font-medium ${
              preset === 'custom'
                ? 'border-zinc-950 bg-zinc-950 text-white'
                : 'border-border hover:bg-accent'
            }`}
          >
            {labels.customDates}
            {' · '}
            {shortDay(payFrom, locale)}
            {payTo !== payFrom ? ` – ${shortDay(payTo, locale)}` : ''}
          </button>
          {rangeOpen ? (
            <PayRangeCalendar
              key={`${payFrom}:${payTo}`}
              spanDays={spanDays}
              payable={payableDates}
              weekdays={labels.weekdays}
              locale={locale}
              today={model.today}
              from={payFrom}
              to={payTo}
              onClose={() => setRangeOpen(false)}
              onApply={(from, to) => applyWindow(from, to, 'custom')}
              labels={{
                pickRange: labels.pickRange,
                showDays: labels.showDays,
                prev: labels.prev,
                next: labels.next,
              }}
            />
          ) : null}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <h5 className="text-sm font-semibold">{labels.dayList}</h5>
          <p className="mt-1 text-xs text-muted-foreground">
            {labels.dayListHint}
            {dayPay.rows.length > 0
              ? ` · ${shortDay(dayPay.rows[0].date, locale)}${
                  dayPay.rows.length > 1
                    ? ` – ${shortDay(dayPay.rows[dayPay.rows.length - 1].date, locale)}`
                    : ''
                }`
              : ''}
          </p>
          {dayPay.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{labels.nothingInRange}</p>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {dayPay.rows.map((row) => (
                  <li key={row.date} className="rounded-lg border border-border px-3 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={hrefFor(row.date)} className="font-semibold hover:underline">
                        {formatWeekdayDate(row.date, locale)}
                      </Link>
                      <MoneyPair sar={row.sar} usd={row.usd} big />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {row.categories.map((category) => (
                        <div key={category.id} className="rounded-md bg-muted/40 px-2.5 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold">{categoryLabel(category.id, labels)}</span>
                            <MoneyPair sar={category.sar} usd={category.usd} />
                          </div>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {category.people.map((person) => (
                              <li
                                key={person.creatorId}
                                className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                              >
                                <span className="min-w-0 truncate">{person.name}</span>
                                <span className="shrink-0 tabular-nums">{formatMoney(person.sar, 'SAR')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-4">
                {(['creators', 'reposters', 'management'] as const).map((id) =>
                  dayPay.totals[id] <= 0.009 ? null : (
                    <div key={id}>
                      <p className="text-xs text-muted-foreground">{categoryLabel(id, labels)}</p>
                      <MoneyPair sar={dayPay.totals[id]} />
                    </div>
                  ),
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{labels.rangeTotal}</p>
                  <MoneyPair sar={dayPay.totals.sar} usd={dayPay.totals.usd} big />
                </div>
              </div>
            </>
          )}
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
