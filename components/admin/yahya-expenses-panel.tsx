'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import { usdToSar } from '@/lib/fx'
import { shiftYearMonth } from '@/lib/biweekly'
import {
  addYahyaExpenseItem,
  removeYahyaExpenseItem,
  resetYahyaPersonOverride,
  saveYahyaHome,
  saveYahyaPersonMonthly,
} from '@/app/actions/yahya-expenses'
import type {
  YahyaExpenseCategory,
  YahyaExpensePerson,
  YahyaExpensesSnapshot,
  YahyaHome,
} from '@/lib/yahya-expenses'

function DualMoney({ usd, big }: { usd: number; big?: boolean }) {
  const sar = usdToSar(usd)
  return (
    <div className={big ? 'flex flex-col gap-0.5' : 'inline-flex flex-wrap items-baseline gap-x-1.5'}>
      <span className={(big ? 'text-2xl font-bold ' : 'font-semibold ') + 'tabular-nums'}>
        {formatMoney(sar, 'SAR')}
      </span>
      <span
        className={(big ? 'text-sm ' : 'text-xs ') + 'tabular-nums text-muted-foreground'}
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
  yearMonth,
  checked,
  onToggle,
  onCheckAll,
  canMove,
}: {
  category: YahyaExpenseCategory
  yearMonth: string
  checked: Set<string>
  onToggle: (key: string) => void
  onCheckAll: (keys: string[], done: boolean) => void
  canMove: boolean
}) {
  const [open, setOpen] = useState(false)
  const done = category.people.filter((p) => checked.has(p.key)).length
  const total = category.people.length
  const allDone = total > 0 && done === total

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
                  category.people.length === 1 ? 'person' : 'people'
                }`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(usdToSar(category.totalUsd), 'SAR')}
            </p>
            <p className="text-[11px] tabular-nums text-white/70">
              {formatMoney(category.totalUsd, 'USD')} / month
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
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  onCheckAll(
                    category.people.map((p) => p.key),
                    !allDone,
                  )
                }
                className="text-xs font-medium text-sky-800 hover:underline dark:text-sky-300"
              >
                {allDone ? 'Uncheck all in this list' : 'Check all in this list'}
              </button>
            </div>
            <ul className="divide-y divide-border">
              {category.people.map((person) => (
                <PersonRow
                  key={`${category.id}-${person.key}`}
                  person={person}
                  yearMonth={yearMonth}
                  done={checked.has(person.key)}
                  onToggle={() => onToggle(person.key)}
                  canMove={canMove}
                />
              ))}
            </ul>
          </>
        )
      ) : null}
    </section>
  )
}

function MoveControls({
  person,
  canMove,
}: {
  person: YahyaExpensePerson
  canMove: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (!canMove || person.categoryId === 'other') return null

  const dualOptions: { id: YahyaHome; label: string }[] = [
    { id: 'leaders', label: 'Management only' },
    { id: 'reposters', label: 'Reposter only' },
    { id: 'both', label: 'Both places' },
  ]
  const soloOptions: { id: YahyaHome; label: string }[] = [
    { id: 'creators', label: 'Creators' },
    { id: 'reposters', label: 'Reposters' },
    { id: 'leaders', label: 'Leaders / management' },
    { id: 'both', label: 'Reposters + management' },
    { id: 'hidden', label: 'Hide from this page' },
  ]
  const options = person.isDual ? dualOptions : soloOptions

  function move(home: YahyaHome) {
    startTransition(async () => {
      const res = await saveYahyaHome({ personKey: person.homeKey, home })
      if (!res.ok) alert(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {person.isDual && person.also ? (
        <span className="inline-flex w-fit rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          {person.also.kind === 'reposter' ? 'Also a reposter' : 'Also in management'}
          {person.also.label ? ` · ${person.also.label}` : ''}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Move to
        </span>
        <select
          disabled={pending}
          value={person.home}
          onChange={(e) => move(e.target.value as YahyaHome)}
          className="h-7 max-w-[220px] rounded-md border border-border bg-background px-1.5 text-[11px] font-medium disabled:opacity-60"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {pending ? <span className="text-[10px] text-muted-foreground">Saving…</span> : null}
      </div>
    </div>
  )
}

function PersonRow({
  person,
  yearMonth,
  done,
  onToggle,
  canMove,
}: {
  person: YahyaExpensePerson
  yearMonth: string
  done: boolean
  onToggle: () => void
  canMove: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(person.nativeMonthly))
  const [currency, setCurrency] = useState(person.currency)
  const [scope, setScope] = useState<'page' | 'site'>('page')

  useEffect(() => {
    if (!editing) {
      setAmount(String(person.nativeMonthly))
      setCurrency(person.currency)
    }
  }, [person.nativeMonthly, person.currency, editing])

  function save() {
    const n = Number(amount)
    startTransition(async () => {
      const res = await saveYahyaPersonMonthly({
        yearMonth,
        personKey: person.key,
        amount: n,
        currency,
        scope,
        creatorId: person.creatorId,
        leaderId: person.leaderId,
        otherId: person.otherId,
      })
      if (!res.ok) {
        alert(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          title={done ? 'Checked — click to undo' : 'Mark checked'}
          className={
            (done
              ? 'border-emerald-600 bg-emerald-600 text-white '
              : 'border-border bg-background text-transparent hover:border-emerald-500 ') +
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors'
          }
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className={(done ? 'text-muted-foreground line-through ' : '') + 'truncate font-medium'}>
            {person.name}
          </p>
          <p className="text-[11px] capitalize text-muted-foreground">{person.role}</p>
          <MoveControls person={person} canMove={canMove} />
          {person.pageOverride ? (
            <p className="mt-1 text-[10px] font-medium text-sky-800 dark:text-sky-300">
              This-page override for {yearMonth}
              <button
                type="button"
                disabled={pending}
                className="ms-2 underline"
                onClick={() =>
                  startTransition(async () => {
                    const res = await resetYahyaPersonOverride({
                      yearMonth,
                      personKey: person.key,
                    })
                    if (!res.ok) alert(res.error)
                    else router.refresh()
                  })
                }
              >
                Clear
              </button>
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {editing ? (
            <div className="flex w-[220px] flex-col gap-1.5 rounded-lg border border-border bg-background p-2 text-left">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Monthly amount
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                  className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground"
                />
              </label>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(['SAR', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={
                      (currency === c ? 'bg-foreground text-background ' : 'text-muted-foreground ') +
                      'flex-1 rounded px-2 py-0.5 text-[11px] font-semibold'
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Apply to
                </p>
                <label className="flex items-start gap-1.5 text-[11px]">
                  <input
                    type="radio"
                    name={`scope-${person.key}`}
                    checked={scope === 'page'}
                    onChange={() => setScope('page')}
                    className="mt-0.5"
                  />
                  <span>This page only (this month)</span>
                </label>
                <label className="flex items-start gap-1.5 text-[11px]">
                  <input
                    type="radio"
                    name={`scope-${person.key}`}
                    checked={scope === 'site'}
                    onChange={() => setScope('site')}
                    className="mt-0.5"
                  />
                  <span>Whole site (real pay)</span>
                </label>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={save}
                  className="h-7 flex-1 rounded-md bg-primary text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {pending ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold tabular-nums">
                {formatMoney(usdToSar(person.monthlyUsd), 'SAR')}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatMoney(person.monthlyUsd, 'USD')}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                Monthly
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            </>
          )}
        </div>
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
        Other expense (monthly)
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
              {formatMoney(item.amount, item.currency)} / month
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
  canMove = false,
}: {
  snapshot: YahyaExpensesSnapshot
  today: string
  canMove?: boolean
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
  const allDone = allKeys.length > 0 && checkedCount === allKeys.length

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

  function checkAll(keys: string[], done: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (done) next.add(key)
        else next.delete(key)
      }
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
        <p className="mt-2 text-xs text-white/70">Monthly total · salaries Ahmed can go over</p>
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {snapshot.categories.map((c) => (
          <div key={c.id} className="rounded-xl border border-border px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-1 font-semibold tabular-nums">
              {formatMoney(usdToSar(c.totalUsd), 'SAR')}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatMoney(c.totalUsd, 'USD')} / month
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {c.people.length} {c.people.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Every amount is <span className="font-semibold text-foreground">monthly</span>. Open a list
          when you want it. Check people as you verify ({checkedCount}/{allKeys.length} done).
          {canMove
            ? ' Yahya and Ahmed can move anyone between lists.'
            : null}
        </p>
        <button
          type="button"
          onClick={() => checkAll(allKeys, !allDone)}
          className="text-xs font-medium text-sky-800 hover:underline dark:text-sky-300"
        >
          {allDone ? 'Uncheck everyone' : 'Check everyone'}
        </button>
      </div>

      {snapshot.categories.map((category) => (
        <CategoryBlock
          key={category.id}
          category={category}
          yearMonth={snapshot.yearMonth}
          checked={checked}
          onToggle={toggle}
          onCheckAll={checkAll}
          canMove={canMove}
        />
      ))}

      <div className="flex flex-col gap-2">
        <OtherExpenseForm yearMonth={snapshot.yearMonth} />
        <OtherExpenseDeletes items={snapshot.other} />
      </div>
    </div>
  )
}
