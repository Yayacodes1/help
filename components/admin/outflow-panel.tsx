'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { PayCadences } from '@/components/admin/pay-cadence'
import { formatDate, formatMoney } from '@/lib/format'
import { usdToSar } from '@/lib/fx'
import {
  calendarMonthBounds,
  lastCalendarMonthsRange,
  shiftYearMonth,
} from '@/lib/biweekly'
import type {
  MarketingMonthBucket,
  OutflowMonthBucket,
  OutflowPersonTotal,
  OutflowScheduleGroup,
  OutflowSnapshot,
  OutflowView,
} from '@/lib/outflow'

type AmountMode = 'planned' | 'paid'

function DualMoney({
  usd,
  emphasize,
}: {
  usd: number
  emphasize?: boolean
}) {
  const sar = usdToSar(usd)
  return (
    <span className={emphasize ? 'font-semibold' : undefined}>
      <span className="tabular-nums">{formatMoney(sar, 'SAR')}</span>
      <span className="mx-1 text-muted-foreground">/</span>
      <span className="tabular-nums">{formatMoney(usd, 'USD')}</span>
    </span>
  )
}

function MoneyCell({ usd, emphasize }: { usd: number; emphasize?: boolean }) {
  const sar = usdToSar(usd)
  const cls = (emphasize ? 'font-semibold ' : '') + 'tabular-nums'
  return (
    <>
      <td className="px-3 py-2 text-right">
        <span className={cls}>{formatMoney(sar, 'SAR')}</span>
      </td>
      <td className="px-3 py-2 text-right">
        <span className={cls}>{formatMoney(usd, 'USD')}</span>
      </td>
    </>
  )
}

function TermPill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-sky-900 ring-1 ring-sky-100">
      {label}
    </span>
  )
}

function CollapsibleSection({
  title,
  children,
  empty,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  empty?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 border-b border-border bg-slate-900 px-3 py-2.5 text-left"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-white">{title}</h3>
        <ChevronDown
          className={
            (open ? 'rotate-0 ' : '-rotate-90 ') +
            'h-4 w-4 shrink-0 text-white/80 transition-transform'
          }
        />
      </button>
      {open ? (
        empty ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">Nothing in this range.</p>
        ) : (
          children
        )
      ) : null}
    </section>
  )
}

function MonthByMonthLine({
  months,
  mode,
}: {
  months: MarketingMonthBucket[]
  mode: AmountMode
}) {
  if (months.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">No months in this range.</p>
    )
  }

  const creatorsSum = months.reduce(
    (s, m) => s + (mode === 'planned' ? m.plannedCreators : m.paidCreators),
    0,
  )
  const repostersSum = months.reduce(
    (s, m) => s + (mode === 'planned' ? m.plannedReposters : m.paidReposters),
    0,
  )
  const totalSum = creatorsSum + repostersSum

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Month</th>
            <th className="px-3 py-2 font-medium text-right">Creators SAR</th>
            <th className="px-3 py-2 font-medium text-right">Creators USD</th>
            <th className="px-3 py-2 font-medium text-right">Reposters SAR</th>
            <th className="px-3 py-2 font-medium text-right">Reposters USD</th>
            <th className="px-3 py-2 font-medium text-right">Total SAR</th>
            <th className="px-3 py-2 font-medium text-right">Total USD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {months.map((m) => {
            const creators = mode === 'planned' ? m.plannedCreators : m.paidCreators
            const reposters = mode === 'planned' ? m.plannedReposters : m.paidReposters
            const total = creators + reposters
            return (
              <tr key={m.key}>
                <td className="px-3 py-2 font-medium">{m.label}</td>
                <MoneyCell usd={creators} />
                <MoneyCell usd={reposters} />
                <MoneyCell usd={total} emphasize />
              </tr>
            )
          })}
          <tr className="bg-sky-50/80">
            <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-sky-950">
              All months
            </td>
            <MoneyCell usd={creatorsSum} emphasize />
            <MoneyCell usd={repostersSum} emphasize />
            <MoneyCell usd={totalSum} emphasize />
          </tr>
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        {mode === 'planned'
          ? 'Base only · no commission · month-to-month planned'
          : 'Recorded payments in each month (includes commission if you paid it)'}
      </p>
    </div>
  )
}

function sumField(people: OutflowPersonTotal[], key: 'biweekly' | 'monthly'): number {
  return Math.round(people.reduce((s, p) => s + p[key], 0) * 100) / 100
}

function PersonPayList({
  title,
  people,
}: {
  title: string
  people: OutflowPersonTotal[]
}) {
  const biweekly = sumField(people, 'biweekly')
  const monthly = sumField(people, 'monthly')
  return (
    <div>
      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sky-950">
        {title}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-y border-border bg-secondary/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium text-right">Biweekly SAR</th>
              <th className="px-3 py-2 font-medium text-right">Biweekly USD</th>
              <th className="px-3 py-2 font-medium text-right">Monthly SAR</th>
              <th className="px-3 py-2 font-medium text-right">Monthly USD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((p) => (
              <tr key={p.creator_id}>
                <td className="px-3 py-2 font-medium">{p.creator_name}</td>
                <MoneyCell usd={p.biweekly} />
                <MoneyCell usd={p.monthly} emphasize />
              </tr>
            ))}
            <tr className="bg-sky-50/80">
              <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-sky-950">
                {title} total
              </td>
              <MoneyCell usd={biweekly} emphasize />
              <MoneyCell usd={monthly} emphasize />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeopleTotals({ people }: { people: OutflowPersonTotal[] }) {
  const creators = people.filter((p) => p.role !== 'reposter')
  const reposters = people.filter((p) => p.role === 'reposter' && p.biweekly > 0)
  if (creators.length === 0 && reposters.length === 0) {
    return <p className="px-3 py-6 text-sm text-muted-foreground">No people in this range.</p>
  }
  const showBoth = creators.length > 0 && reposters.length > 0
  const allBiweekly = sumField([...creators, ...reposters], 'biweekly')
  const allMonthly = sumField([...creators, ...reposters], 'monthly')

  return (
    <div className="flex flex-col gap-4 pb-3">
      {creators.length > 0 ? <PersonPayList title="Creators" people={creators} /> : null}
      {reposters.length > 0 ? <PersonPayList title="Reposters" people={reposters} /> : null}
      {showBoth ? (
        <div className="mx-3 overflow-hidden rounded-lg bg-slate-900 px-3 py-3 text-sm text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            Creators + reposters
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-white/70">Biweekly total</p>
              <p className="font-semibold tabular-nums">{formatMoney(usdToSar(allBiweekly), 'SAR')}</p>
              <p className="text-sm font-medium tabular-nums text-white/90">
                {formatMoney(allBiweekly, 'USD')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/70">Monthly total</p>
              <p className="font-semibold tabular-nums">{formatMoney(usdToSar(allMonthly), 'SAR')}</p>
              <p className="text-sm font-medium tabular-nums text-white/90">
                {formatMoney(allMonthly, 'USD')}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <p className="px-3 text-[11px] text-muted-foreground">
        Monthly is always double the biweekly amount for each person. Base only · no commission.
      </p>
    </div>
  )
}

function ScheduleTable({
  rows,
  months,
}: {
  rows: OutflowScheduleGroup[]
  months: OutflowMonthBucket[]
}) {
  const byMonth = new Map<string, OutflowScheduleGroup[]>()
  for (const row of rows) {
    const key = row.paid_on.slice(0, 7)
    const list = byMonth.get(key) ?? []
    list.push(row)
    byMonth.set(key, list)
  }

  const monthKeys = [...byMonth.keys()].sort()
  const grand = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/30 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Term</th>
            <th className="px-3 py-2 font-medium">Names</th>
            <th className="px-3 py-2 font-medium text-right">#</th>
            <th className="px-3 py-2 font-medium text-right">SAR</th>
            <th className="px-3 py-2 font-medium text-right">USD</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {monthKeys.map((key) => {
            const list = byMonth.get(key)!
            const monthTotal = list.reduce((s, r) => s + r.total, 0)
            const month = months.find((m) => m.key === key)
            const label = month?.label ?? key
            return (
              <FragmentMonth key={key} label={label} rows={list} monthTotal={monthTotal} />
            )
          })}
          <tr className="bg-sky-50/80">
            <td
              colSpan={4}
              className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-sky-950"
            >
              Schedule total
            </td>
            <MoneyCell usd={grand} emphasize />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function FragmentMonth({
  label,
  rows,
  monthTotal,
}: {
  label: string
  rows: OutflowScheduleGroup[]
  monthTotal: number
}) {
  return (
    <>
      {rows.map((row) => (
        <tr key={`${row.paid_on}-${row.term}`}>
          <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.paid_on)}</td>
          <td className="px-3 py-2">
            <TermPill label={row.term} />
          </td>
          <td className="px-3 py-2 text-muted-foreground">{row.names.join(', ')}</td>
          <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
          <MoneyCell usd={row.total} />
        </tr>
      ))}
      <tr className="bg-secondary/20">
        <td colSpan={4} className="px-3 py-2 text-xs font-medium text-sky-800">
          {label}
        </td>
        <MoneyCell usd={monthTotal} emphasize />
      </tr>
    </>
  )
}

function MarketingMonths({ months }: { months: MarketingMonthBucket[] }) {
  if (months.length === 0) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">
        No month-to-month payments in this range.
      </p>
    )
  }
  return (
    <div className="divide-y divide-border">
      {months.map((m) => (
        <div key={m.key} className="px-3 py-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-xs text-muted-foreground">
                Creators <DualMoney usd={m.plannedCreators} /> · Reposters{' '}
                <DualMoney usd={m.plannedReposters} />
              </p>
            </div>
            <div className="text-right text-sm">
              <span className="text-xs text-muted-foreground">Month total </span>
              <DualMoney usd={m.planned} emphasize />
            </div>
          </div>
          {m.people.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Person</th>
                    <th className="py-1 pr-2 font-medium">In-month payments</th>
                    <th className="py-1 pr-2 font-medium text-right">SAR</th>
                    <th className="py-1 font-medium text-right">USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {m.people.map((p) => (
                    <tr key={p.creator_id}>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{p.creator_name}</span>
                        <span className="ml-1 text-[11px] capitalize text-muted-foreground">
                          {p.role}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                        {p.installments.length === 0
                          ? '—'
                          : p.installments
                              .map(
                                (i) =>
                                  `${formatDate(i.dueOn)} ${formatMoney(usdToSar(i.amount), 'SAR')} / ${formatMoney(i.amount, 'USD')}`,
                              )
                              .join(' · ')}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {formatMoney(usdToSar(p.planned || p.paid), 'SAR')}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(p.planned || p.paid, 'USD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const VIEWS: { id: OutflowView; label: string }[] = [
  { id: 'reposters', label: 'Reposters' },
  { id: 'creators', label: 'Creators' },
  { id: 'total', label: 'Total' },
]

const AMOUNT_MODES: { id: AmountMode; label: string }[] = [
  { id: 'planned', label: 'Base (no commission)' },
  { id: 'paid', label: 'Paid (recorded)' },
]

export function OutflowPanel({
  snapshot,
  today,
  defaultFrom,
  defaultTo,
}: {
  snapshot: OutflowSnapshot
  today: string
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const from = params.get('ofFrom') || defaultFrom
  const to = params.get('ofTo') || defaultTo
  const viewParam = params.get('ofView')
  const view: OutflowView =
    viewParam === 'creators' || viewParam === 'reposters' || viewParam === 'total'
      ? viewParam
      : snapshot.view || 'total'
  const amountMode: AmountMode = params.get('ofPay') === 'paid' ? 'paid' : 'planned'

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'outflow')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.replace(`/admin?${next.toString()}`, { scroll: false })
  }

  function selectCalendarMonth(yearMonth: string) {
    const bounds = calendarMonthBounds(yearMonth)
    push({ ofFrom: bounds.start, ofTo: bounds.end })
  }

  function selectLastTwoCalendarMonths() {
    const range = lastCalendarMonthsRange(today, 2)
    push({ ofFrom: range.start, ofTo: range.end })
  }

  const monthInputValue = from.slice(0, 7)
  const biweeklyShown = snapshot.plannedBiweekly
  const monthlyShown = snapshot.plannedMonthly

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => push({ ofView: v.id })}
                className={
                  (view === v.id
                    ? 'bg-slate-900 text-white'
                    : 'text-muted-foreground hover:text-foreground') +
                  ' rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
                }
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {AMOUNT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => push({ ofPay: m.id === 'planned' ? null : m.id })}
                className={
                  (amountMode === m.id
                    ? 'bg-sky-700 text-white'
                    : 'text-muted-foreground hover:text-foreground') +
                  ' rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border px-4 py-4">
        <PayCadences monthlyUsd={monthlyShown} biweeklyUsd={biweeklyShown} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectCalendarMonth(today.slice(0, 7))}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => selectCalendarMonth(shiftYearMonth(today.slice(0, 7), -1))}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
        >
          Last month
        </button>
        <button
          type="button"
          onClick={selectLastTwoCalendarMonths}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
        >
          Last 2 months
        </button>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-sm">
          <span className="text-xs text-muted-foreground">Month</span>
          <input
            type="month"
            value={monthInputValue}
            onChange={(e) => {
              if (e.target.value) selectCalendarMonth(e.target.value)
            }}
            className="bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <DateRangePresets
        today={today}
        from={from}
        to={to}
        onSelect={(nextFrom, nextTo) => push({ ofFrom: nextFrom, ofTo: nextTo })}
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => push({ ofFrom: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => push({ ofTo: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
      </div>

      <CollapsibleSection
        title="Total month-by-month"
        empty={snapshot.marketingMonths.length === 0}
        defaultOpen
      >
        {snapshot.marketingMonths.length > 0 ? (
          <MonthByMonthLine months={snapshot.marketingMonths} mode={amountMode} />
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Each person"
        empty={snapshot.peopleTotals.length === 0}
        defaultOpen
      >
        {snapshot.peopleTotals.length > 0 ? (
          <PeopleTotals people={snapshot.peopleTotals} />
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Marketing by month"
        empty={snapshot.marketingMonths.length === 0}
        defaultOpen
      >
        {snapshot.marketingMonths.length > 0 ? (
          <MarketingMonths months={snapshot.marketingMonths} />
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Payment schedule"
        empty={snapshot.schedule.length === 0}
        defaultOpen
      >
        {snapshot.schedule.length > 0 ? (
          <ScheduleTable rows={snapshot.schedule} months={snapshot.months} />
        ) : null}
      </CollapsibleSection>
    </div>
  )
}
