'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { adminPersonHref } from '@/lib/admin-href'
import { formatMoney } from '@/lib/format'
import { usdToSar } from '@/lib/fx'
import { shiftYearMonth } from '@/lib/biweekly'
import {
  addYahyaExpenseItem,
  addYahyaPerson,
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

type SortMode = 'name-asc' | 'name-desc' | 'pay-high' | 'pay-low'
type PeopleHome = 'creators' | 'reposters' | 'leaders'

const SORT_OPTIONS: { id: SortMode; label: string; icon: typeof ArrowDownAZ }[] = [
  { id: 'name-asc', label: 'A–Z', icon: ArrowDownAZ },
  { id: 'name-desc', label: 'Z–A', icon: ArrowUpAZ },
  { id: 'pay-high', label: 'Highest', icon: ArrowDownWideNarrow },
  { id: 'pay-low', label: 'Lowest', icon: ArrowUpWideNarrow },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function DualMoney({ usd, big }: { usd: number; big?: boolean }) {
  const sar = usdToSar(usd)
  return (
    <div className={big ? 'flex flex-col gap-0.5' : 'inline-flex flex-wrap items-baseline gap-x-1.5'}>
      <span className={(big ? 'text-3xl font-bold tracking-tight ' : 'font-semibold ') + 'tabular-nums'}>
        {formatMoney(sar, 'SAR')}
      </span>
      <span className={(big ? 'text-sm ' : 'text-xs ') + 'tabular-nums opacity-70'}>
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
    /* ignore */
  }
}

function filterAndSortPeople(
  people: YahyaExpensePerson[],
  query: string,
  letter: string | null,
  sort: SortMode,
): YahyaExpensePerson[] {
  const q = query.trim().toLowerCase()
  let list = people
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q))
  if (letter) {
    list = list.filter((p) => p.name.trim().charAt(0).toUpperCase() === letter)
  }
  return [...list].sort((a, b) => {
    if (sort === 'pay-high') return b.monthlyUsd - a.monthlyUsd || a.name.localeCompare(b.name)
    if (sort === 'pay-low') return a.monthlyUsd - b.monthlyUsd || a.name.localeCompare(b.name)
    if (sort === 'name-desc') return b.name.localeCompare(a.name)
    return a.name.localeCompare(b.name)
  })
}

function InlineAddPerson({
  yearMonth,
  home,
}: {
  yearMonth: string
  home: PeopleHome
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'SAR' | 'USD'>('SAR')
  const [scope, setScope] = useState<'page' | 'site'>('site')

  if (!open) {
    return (
      <div className="border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-semibold text-foreground hover:bg-muted/60"
        >
          <Plus className="h-3.5 w-3.5" />
          Add someone here
        </button>
      </div>
    )
  }

  return (
    <form
      className="border-t border-border bg-secondary/20 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(amount)
        startTransition(async () => {
          const res = await addYahyaPerson({
            yearMonth,
            name,
            home,
            amount: n,
            currency,
            scope,
          })
          if (!res.ok) {
            alert(res.error)
            return
          }
          setName('')
          setAmount('')
          setOpen(false)
          router.refresh()
        })
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Add someone to this list</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type their name…"
            autoFocus
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-[11px] text-muted-foreground">
          Monthly
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm tabular-nums text-foreground"
          />
        </label>
        <div className="inline-flex h-9 rounded-lg border border-border bg-background p-0.5">
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
        <div className="inline-flex h-9 rounded-lg border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setScope('page')}
            className={
              (scope === 'page' ? 'bg-foreground text-background ' : 'text-muted-foreground ') +
              'rounded-md px-2.5 text-xs font-semibold'
            }
          >
            This page
          </button>
          <button
            type="button"
            onClick={() => setScope('site')}
            className={
              (scope === 'site' ? 'bg-foreground text-background ' : 'text-muted-foreground ') +
              'rounded-md px-2.5 text-xs font-semibold'
            }
          >
            Whole site
          </button>
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          {pending ? '…' : 'Add'}
        </button>
      </div>
    </form>
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

  const options: { id: YahyaHome; label: string }[] = person.isDual
    ? [
        { id: 'leaders', label: 'Management only' },
        { id: 'reposters', label: 'Reposter only' },
        { id: 'both', label: 'Both places' },
      ]
    : [
        { id: 'creators', label: 'Creators' },
        { id: 'reposters', label: 'Reposters' },
        { id: 'leaders', label: 'Leaders / management' },
        { id: 'both', label: 'Reposters + management' },
        { id: 'hidden', label: 'Hide' },
      ]

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {person.isDual && person.also ? (
        <span className="inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200">
          {person.also.kind === 'reposter' ? 'Also a reposter' : 'Also in management'}
          {person.also.label ? ` · ${person.also.label}` : ''}
        </span>
      ) : null}
      <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Move
        <select
          disabled={pending}
          value={person.home}
          onChange={(e) =>
            startTransition(async () => {
              const res = await saveYahyaHome({
                personKey: person.homeKey,
                home: e.target.value as YahyaHome,
              })
              if (!res.ok) alert(res.error)
              else router.refresh()
            })
          }
          className="h-7 max-w-[200px] rounded-md border border-border bg-background px-1.5 text-[11px] font-medium text-foreground disabled:opacity-60"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
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
  const [scope, setScope] = useState<'page' | 'site'>('site')

  useEffect(() => {
    if (!editing) {
      setAmount(String(person.nativeMonthly))
      setCurrency(person.currency)
    }
  }, [person.nativeMonthly, person.currency, editing])

  return (
    <li className="px-3 py-3 hover:bg-muted/30">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          className={
            (done
              ? 'border-emerald-600 bg-emerald-600 text-white '
              : 'border-border bg-background text-transparent hover:border-emerald-500 ') +
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors'
          }
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className={(done ? 'text-muted-foreground line-through ' : '') + 'truncate text-sm font-medium'}>
            {person.name}
          </p>
          <p className="text-[11px] capitalize text-muted-foreground">{person.role}</p>
          <MoveControls person={person} canMove={canMove} />
          {person.pageOverride ? (
            <p className="mt-1 text-[10px] font-medium text-sky-800 dark:text-sky-300">
              Override this month
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
            <div className="flex w-[210px] flex-col gap-1.5 rounded-xl border border-border bg-background p-2.5 text-left shadow-sm">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Monthly
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                  className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums"
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
              <div className="flex flex-col gap-1 text-[11px]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={scope === 'page'}
                    onChange={() => setScope('page')}
                  />
                  This page only
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={scope === 'site'}
                    onChange={() => setScope('site')}
                  />
                  Whole site
                </label>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const n = Number(amount)
                      if (!Number.isFinite(n) || n < 0) {
                        alert('Enter a valid monthly amount.')
                        return
                      }
                      const res = await saveYahyaPersonMonthly({
                        yearMonth,
                        personKey: person.key,
                        amount: n,
                        currency,
                        scope,
                        creatorId: person.creatorId,
                        leaderId: person.leaderId,
                        otherId: person.otherId,
                        customId: person.customId,
                      })
                      if (!res.ok) alert(res.error)
                      else {
                        setEditing(false)
                        router.refresh()
                      }
                    })
                  }
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
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(usdToSar(person.monthlyUsd), 'SAR')}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatMoney(person.monthlyUsd, 'USD')}
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                Monthly
              </p>
              <div className="mt-1 flex items-center justify-end gap-1">
                {person.categoryId === 'creators' && person.creatorId != null && person.creatorId > 0 ? (
                  <Link
                    href={adminPersonHref(person.creatorId, {
                      role: person.role === 'reposter' ? 'reposter' : null,
                      panel: 'contracts',
                      from: 'yahya',
                    })}
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Contract
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function CategoryBlock({
  category,
  yearMonth,
  checked,
  onToggle,
  onCheckAll,
  canMove,
  query,
  letter,
  sort,
  otherItems,
}: {
  category: YahyaExpenseCategory
  yearMonth: string
  checked: Set<string>
  onToggle: (key: string) => void
  onCheckAll: (keys: string[], done: boolean) => void
  canMove: boolean
  query: string
  letter: string | null
  sort: SortMode
  otherItems: YahyaExpensesSnapshot['other']
}) {
  const [open, setOpen] = useState(false)
  const people = useMemo(
    () => filterAndSortPeople(category.people, query, letter, sort),
    [category.people, query, letter, sort],
  )
  const done = people.filter((p) => checked.has(p.key)).length
  const total = people.length
  const allDone = total > 0 && done === total
  const filtered = query.trim() !== '' || letter != null
  const peopleHome: PeopleHome | null =
    category.id === 'creators' || category.id === 'reposters' || category.id === 'leaders'
      ? category.id
      : null

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">{category.label.replace(' (monthly)', '')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {category.people.length === 0
              ? 'Empty'
              : filtered
                ? `${total} shown · ${category.people.length} total`
                : `${category.people.length} people · ${done} checked`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(usdToSar(category.totalUsd), 'SAR')}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatMoney(category.totalUsd, 'USD')} / mo
            </p>
          </div>
          <ChevronDown
            className={
              (open ? 'rotate-0 ' : '-rotate-90 ') +
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform'
            }
          />
        </div>
      </button>

      {open ? (
        <div className="border-t border-border">
          {category.id === 'other' ? (
            <OtherInside yearMonth={yearMonth} items={otherItems} />
          ) : people.length === 0 && category.people.length > 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No names match.</p>
          ) : category.people.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Nobody here yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2">
                <button
                  type="button"
                  onClick={() => onCheckAll(people.map((p) => p.key), !allDone)}
                  className="text-xs font-medium text-sky-800 hover:underline dark:text-sky-300"
                >
                  {allDone ? 'Uncheck all' : 'Check all'}
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {done}/{total} checked
                </span>
              </div>
              <ul className="divide-y divide-border/70">
                {people.map((person) => (
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
          )}
          {canMove && peopleHome ? (
            <InlineAddPerson yearMonth={yearMonth} home={peopleHome} />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function OtherInside({
  yearMonth,
  items,
}: {
  yearMonth: string
  items: YahyaExpensesSnapshot['other']
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'SAR' | 'USD'>('SAR')

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(item.amount, item.currency)} / mo
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeYahyaExpenseItem(item.id)
                      if (!res.ok) alert(res.error)
                      else router.refresh()
                    })
                  }
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            const res = await addYahyaExpenseItem({
              yearMonth,
              label,
              amount: Number(amount),
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
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          Name
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="CapCut, phone…"
            required
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-[11px] text-muted-foreground">
          Monthly
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm tabular-nums"
          />
        </label>
        <div className="inline-flex h-9 rounded-lg border border-border bg-background p-0.5">
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
          Add
        </button>
      </form>
    </div>
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
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('name-asc')
  const [lettersOpen, setLettersOpen] = useState(false)

  useEffect(() => {
    setChecked(loadChecked(snapshot.yearMonth))
  }, [snapshot.yearMonth])

  const visibleKeys = useMemo(
    () =>
      snapshot.categories.flatMap((c) =>
        filterAndSortPeople(c.people, query, letter, sort).map((p) => p.key),
      ),
    [snapshot.categories, query, letter, sort],
  )
  const checkedCount = visibleKeys.filter((k) => checked.has(k)).length
  const allDone = visibleKeys.length > 0 && checkedCount === visibleKeys.length

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
  const peopleCategories = snapshot.categories.filter((c) => c.id !== 'other')
  const otherCategory = snapshot.categories.find((c) => c.id === 'other')

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Yahya&apos;s expenses
            </p>
            <p className="mt-1 text-lg font-medium text-white/90">{snapshot.label}</p>
            <div className="mt-3">
              <DualMoney usd={snapshot.grandTotalUsd} big />
            </div>
            <p className="mt-2 text-xs text-white/55">Monthly payroll · SAR & USD</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => pushMonth(thisMonth)}
              className={
                (snapshot.yearMonth === thisMonth
                  ? 'bg-white text-slate-900 '
                  : 'bg-white/10 text-white hover:bg-white/15 ') +
                'h-9 rounded-full px-3.5 text-xs font-semibold'
              }
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => pushMonth(nextMonth)}
              className={
                (snapshot.yearMonth === nextMonth
                  ? 'bg-white text-slate-900 '
                  : 'bg-white/10 text-white hover:bg-white/15 ') +
                'h-9 rounded-full px-3.5 text-xs font-semibold'
              }
            >
              Next month
            </button>
            <label className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3 text-xs text-white/80">
              <span>Month</span>
              <input
                type="month"
                value={snapshot.yearMonth}
                onChange={(e) => {
                  if (e.target.value) pushMonth(e.target.value)
                }}
                className="bg-transparent text-xs text-white outline-none [color-scheme:dark]"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {snapshot.nearbyMonths.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => pushMonth(m.key)}
              className={
                (m.key === snapshot.yearMonth
                  ? 'bg-sky-500 text-white '
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white ') +
                'rounded-full px-2.5 py-1 text-[11px] font-medium'
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {snapshot.categories.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-sm"
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              {c.label.replace(' (monthly)', '')}
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums tracking-tight">
              {formatMoney(usdToSar(c.totalUsd), 'SAR')}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatMoney(c.totalUsd, 'USD')} · {c.people.length}
            </p>
          </div>
        ))}
      </div>

      {/* Search / sort toolbar */}
      <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>
          <div className="inline-flex rounded-xl border border-border bg-background p-0.5">
            {SORT_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = sort === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  onClick={() => setSort(opt.id)}
                  className={
                    (active
                      ? 'bg-slate-900 text-white dark:bg-primary '
                      : 'text-muted-foreground hover:text-foreground ') +
                    'inline-flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-xs font-semibold'
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setLettersOpen((v) => !v)}
            className={
              (letter || lettersOpen
                ? 'border-sky-600 bg-sky-600 text-white '
                : 'border-border text-muted-foreground hover:bg-muted ') +
              'h-10 rounded-xl border px-3 text-xs font-semibold'
            }
          >
            A–Z{letter ? ` · ${letter}` : ''}
          </button>
          {(query || letter) && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setLetter(null)
              }}
              className="h-10 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => checkAll(visibleKeys, !allDone)}
            className="ms-auto h-10 rounded-xl px-3 text-xs font-medium text-sky-800 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
          >
            {allDone ? 'Uncheck all' : `Check all (${checkedCount}/${visibleKeys.length})`}
          </button>
        </div>
        {lettersOpen ? (
          <div className="mt-2.5 flex flex-wrap gap-1 border-t border-border/60 pt-2.5">
            <button
              type="button"
              onClick={() => setLetter(null)}
              className={
                (letter == null
                  ? 'bg-slate-900 text-white dark:bg-primary '
                  : 'border border-border text-muted-foreground hover:bg-muted ') +
                'rounded-lg px-2 py-1 text-[11px] font-semibold'
              }
            >
              All
            </button>
            {LETTERS.map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => setLetter((prev) => (prev === L ? null : L))}
                className={
                  (letter === L
                    ? 'bg-sky-600 text-white '
                    : 'border border-border text-muted-foreground hover:bg-muted ') +
                  'rounded-lg px-2 py-1 text-[11px] font-semibold'
                }
              >
                {L}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Amounts are <span className="font-medium text-foreground">monthly</span>. Open a section to
        review people
        {canMove ? ', move them, or add someone into that list' : ''}.
      </p>

      <div className="flex flex-col gap-3">
        {peopleCategories.map((category) => (
          <CategoryBlock
            key={category.id}
            category={category}
            yearMonth={snapshot.yearMonth}
            checked={checked}
            onToggle={toggle}
            onCheckAll={checkAll}
            canMove={canMove}
            query={query}
            letter={letter}
            sort={sort}
            otherItems={snapshot.other}
          />
        ))}
        {otherCategory ? (
          <CategoryBlock
            key={otherCategory.id}
            category={otherCategory}
            yearMonth={snapshot.yearMonth}
            checked={checked}
            onToggle={toggle}
            onCheckAll={checkAll}
            canMove={canMove}
            query={query}
            letter={letter}
            sort={sort}
            otherItems={snapshot.other}
          />
        ) : null}
      </div>
    </div>
  )
}
