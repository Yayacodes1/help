'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import { usdToSar } from '@/lib/fx'
import { shiftYearMonth } from '@/lib/biweekly'
import {
  addYahyaExpenseItem,
  removeYahyaExpenseItem,
} from '@/app/actions/yahya-expenses'
import type {
  YahyaExpenseCategory,
  YahyaExpensePerson,
  YahyaExpensesSnapshot,
} from '@/lib/yahya-expenses'

function DualMoney({ usd, big }: { usd: number; big?: boolean }) {
  const sar = usdToSar(usd)
  return (
    <div className={big ? 'flex flex-col gap-0.5' : 'inline-flex flex-wrap items-baseline gap-x-1.5'}>
      <span className={(big ? 'text-2xl font-bold ' : 'font-semibold ') + 'tabular-nums'}>
        {formatMoney(sar, 'SAR')}
      </span>
      <span
        className={
          (big ? 'text-sm ' : 'text-xs ') + 'tabular-nums text-muted-foreground'
        }
      >
        {formatMoney(usd, 'USD')}
      </span>
    </div>
  )
}

function checkedStorageKey(yearMonth: string) {
  return `yahya-expenses-checked:${yearMonth}`
}

function loadChecked(yearMonth: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(checkedStorageKey(yearMonth))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveChecked(yearMonth: string, keys: Set<string>) {
  try {
    localStorage.setItem(checkedStorageKey(yearMonth), JSON.stringify([...keys]))
  } catch {
    /* ignore quota */
  }
}

function CategoryBlock({
  category,
  checked,
  onToggle,
}: {
  category: YahyaExpenseCategory
  checked: Set<string>
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(true)
  const done = category.people.filter((p) => checked.has(p.key)).length
  const total = category.people.length

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-border bg-slate-900 px-3 py-2.5 text-left text-white dark:bg-primary"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide">{category.label}</p>
          <p className="text-[11px] text-white/70">
            {total === 0
              ? 'Nobody yet'
              : `${done}/${total} checked · ${category.people.length} ${
                  category.people.length === 1 ? 'line' : 'lines'
                }`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(usdToSar(category.totalUsd), 'SAR')}
            </p>
            <p className="text-[11px] tabular-nums text-white/70">
              {formatMoney(category.totalUsd, 'USD')}
            </p>
          </div>
          <ChevronDown
            className={
              (open ? 'rotate-0 ' : '-rotate-90 ') +
              'h-4 w-4 shrink-0 text-white/80 transition-transform'
            }
          />
        </div>
      </button>
      {open ? (
        category.people.length === 0 ? (
          <p className="px-3 py-5 text-sm text-muted-foreground">
            {category.id === 'other'
              ? 'Add subscriptions and other fixed costs below.'
              : 'Nothing in this category for this month.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {category.people.map((person) => (
              <PersonRow
                key={person.key}
                person={person}
                done={checked.has(person.key)}
                onToggle={() => onToggle(person.key)}
              />
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

function PersonRow({
  person,
  done,
  onToggle,
}: {
  person: YahyaExpensePerson
  done: boolean
  onToggle: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        title={done ? 'Checked — click to undo' : 'Mark checked'}
        className={
          (done
            ? 'border-emerald-600 bg-emerald-600 text-white '
            : 'border-border bg-background text-transparent hover:border-emerald-500 ') +
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors'
        }
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={(done ? 'text-muted-foreground line-through ' : '') + 'truncate font-medium'}>
          {person.name}
        </p>
        <p className="text-[11px] capitalize text-muted-foreground">{person.role}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">
          {formatMoney(usdToSar(person.monthlyUsd), 'SAR')}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatMoney(person.monthlyUsd, 'USD')}
          {person.nativeAmount != null && person.currency === 'USD' ? (
            <span className="ms-1">(paid in USD)</span>
          ) : null}
        </p>
      </div>
    </li>
  )
}

function OtherExpenseForm({ yearMonth }: { yearMonth: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'SAR' | 'USD'>('SAR')

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(amount)
        startTransition(async () => {
          const res = await addYahyaExpenseItem({
            yearMonth,
            label,
            amount: n,
            currency,
          })
          if (!res.ok) {
            alert(res.error)
            return
          }
          setLabel('')
          setAmount('')
          router.refresh()
        })
      }}
    >
      <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Other expense
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. CapCut, Phone plan"
          required
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
        />
      </label>
      <label className="flex w-28 flex-col gap-1 text-xs text-muted-foreground">
        Amount
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm tabular-nums text-foreground"
        />
      </label>
      <div className="inline-flex h-9 rounded-lg border border-border p-0.5">
        {(['SAR', 'USD'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            className={
              (currency === c ? 'bg-foreground text-background ' : 'text-muted-foreground ') +
              'rounded-md px-2.5 text-xs font-semibold'
            }
          >
            {c}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        {pending ? '…' : 'Add'}
      </button>
    </form>
  )
}

function OtherExpenseDeletes({
  items,
}: {
  items: YahyaExpensesSnapshot['other']
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <span className="font-medium">{item.label}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(item.amount, item.currency)}
            </span>
            <button
              type="button"
              disabled={pending}
              title="Remove"
              onClick={() =>
                startTransition(async () => {
                  const res = await removeYahyaExpenseItem(item.id)
                  if (!res.ok) alert(res.error)
                  else router.refresh()
                })
              }
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function YahyaExpensesPanel({
  snapshot,
  today,
}: {
  snapshot: YahyaExpensesSnapshot
  today: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [checked, setChecked] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setChecked(loadChecked(snapshot.yearMonth))
  }, [snapshot.yearMonth])

  const allKeys = useMemo(
    () => snapshot.categories.flatMap((c) => c.people.map((p) => p.key)),
    [snapshot.categories],
  )
  const checkedCount = allKeys.filter((k) => checked.has(k)).length

  function pushMonth(yearMonth: string) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'yahya')
    next.set('tab', 'money')
    next.set('yeMonth', yearMonth)
    router.replace(`/admin?${next.toString()}`, { scroll: false })
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(snapshot.yearMonth, next)
      return next
    })
  }

  const thisMonth = today.slice(0, 7)
  const nextMonth = shiftYearMonth(thisMonth, 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-slate-900 px-4 py-5 text-white dark:bg-primary">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
          Yahya&apos;s expenses · {snapshot.label}
        </p>
        <div className="mt-2">
          <DualMoney usd={snapshot.grandTotalUsd} big />
        </div>
        <p className="mt-2 text-xs text-white/70">
          Payroll{' '}
          <span className="font-medium text-white">
            {formatMoney(usdToSar(snapshot.payrollUsd), 'SAR')}
          </span>
          <span className="mx-1">·</span>
          Commission this month{' '}
          <span className="font-medium text-white">
            {formatMoney(usdToSar(snapshot.commissionUsd), 'SAR')}
          </span>
        </p>
        {snapshot.commissionGoingUsd > 0 ? (
          <p className="mt-1 text-[11px] text-white/60">
            Active-deal commission pot (not monthly):{' '}
            {formatMoney(usdToSar(snapshot.commissionGoingUsd), 'SAR')} ·{' '}
            {formatMoney(snapshot.commissionGoingUsd, 'USD')}
          </p>
        ) : null}
        {snapshot.commissionPayNowUsd > 0 ? (
          <p className="mt-1 text-[11px] text-amber-200">
            Commission still to send:{' '}
            {formatMoney(usdToSar(snapshot.commissionPayNowUsd), 'SAR')} ·{' '}
            {formatMoney(snapshot.commissionPayNowUsd, 'USD')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pushMonth(thisMonth)}
          className={
            (snapshot.yearMonth === thisMonth
              ? 'border-primary bg-primary text-primary-foreground '
              : 'border-border hover:bg-accent ') +
            'h-9 rounded-lg border px-3 text-sm font-medium'
          }
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => pushMonth(nextMonth)}
          className={
            (snapshot.yearMonth === nextMonth
              ? 'border-primary bg-primary text-primary-foreground '
              : 'border-border hover:bg-accent ') +
            'h-9 rounded-lg border px-3 text-sm font-medium'
          }
        >
          Next month
        </button>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-sm">
          <span className="text-xs text-muted-foreground">Month</span>
          <input
            type="month"
            value={snapshot.yearMonth}
            onChange={(e) => {
              if (e.target.value) pushMonth(e.target.value)
            }}
            className="bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {snapshot.nearbyMonths.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => pushMonth(m.key)}
              className={
                (m.key === snapshot.yearMonth
                  ? 'bg-sky-700 text-white '
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground ') +
                'rounded-md px-2 py-1 text-[11px] font-medium'
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {snapshot.categories.map((c) => (
          <div key={c.id} className="rounded-xl border border-border px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-1 font-semibold tabular-nums">
              {formatMoney(usdToSar(c.totalUsd), 'SAR')}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatMoney(c.totalUsd, 'USD')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {c.people.length} {c.people.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Check each person as you verify them ({checkedCount}/{allKeys.length} done). Creator /
        reposter / leader amounts are month-to-month rates. Commission in the total is what was
        earned this month; the deal pot above is planning only.
      </p>

      {snapshot.categories.map((category) => (
        <CategoryBlock
          key={category.id}
          category={category}
          checked={checked}
          onToggle={toggle}
        />
      ))}

      <div className="flex flex-col gap-2">
        <OtherExpenseForm yearMonth={snapshot.yearMonth} />
        <OtherExpenseDeletes items={snapshot.other} />
      </div>
    </div>
  )
}
