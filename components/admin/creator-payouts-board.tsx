'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignCreatorPayout,
  removeCreatorPayout,
  saveCreatorPayout,
} from '@/app/actions/creator-payouts'
import { formatMoney, formatWeekdayDate } from '@/lib/format'
import type {
  CreatorPayoutBoard,
  CreatorPayoutCandidate,
  CreatorPayoutRow,
  PayerGroup,
  PayoutMethod,
} from '@/lib/creator-payouts-types'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function moneyLabel(amount: number, currency: 'SAR' | 'USD') {
  return formatMoney(amount, currency)
}

function methodLabel(method: PayoutMethod | null): string {
  if (method === 'paypal') return 'PayPal'
  if (method === 'bank') return 'Direct deposit'
  return 'No method'
}

function destinationHint(row: CreatorPayoutRow): string | null {
  if (row.method === 'paypal') {
    return row.paypalEmail || row.paypalUsername || null
  }
  if (row.method === 'bank') {
    const parts = [row.accountHolderName, row.bankName, row.city].filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  }
  return null
}

function RowSummary({ row }: { row: CreatorPayoutRow }) {
  const hint = destinationHint(row)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name}</span>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
            row.infoFilled
              ? 'bg-primary/15 text-primary'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
          }`}
        >
          {row.infoFilled ? 'Filled' : 'Missing'}
        </span>
        <span className="text-[11px] text-muted-foreground">{methodLabel(row.method)}</span>
      </div>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      <p className="text-xs tabular-nums text-muted-foreground">
        Base {moneyLabel(row.baseAmount, row.currency)}
        {' · '}
        Commission {moneyLabel(row.commissionAmount, row.currency)}
        {' · '}
        Total {moneyLabel(row.totalAmount, row.currency)}
        {row.dueOn ? ` · Due ${formatWeekdayDate(row.dueOn)}` : ' · No due date'}
      </p>
    </div>
  )
}

function MethodPicker({
  value,
  onChange,
}: {
  value: PayoutMethod | ''
  onChange: (next: PayoutMethod) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(
        [
          { id: 'paypal' as const, title: 'PayPal', blurb: 'Email or PayPal username' },
          { id: 'bank' as const, title: 'Direct deposit', blurb: 'Bank, IBAN, name, city, phone' },
        ] as const
      ).map((opt) => {
        const selected = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
              selected
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border bg-background hover:border-primary/40'
            }`}
          >
            <span className="block text-sm font-semibold">{opt.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{opt.blurb}</span>
          </button>
        )
      })}
    </div>
  )
}

function EditForm({
  row,
  onClose,
}: {
  row: CreatorPayoutRow
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [payerGroup, setPayerGroup] = useState<PayerGroup>(row.payerGroup)
  const [method, setMethod] = useState<PayoutMethod | ''>(row.method ?? '')
  const [paypalEmail, setPaypalEmail] = useState(row.paypalEmail ?? '')
  const [paypalUsername, setPaypalUsername] = useState(row.paypalUsername ?? '')
  const [bankName, setBankName] = useState(row.bankName ?? '')
  const [accountHolderName, setAccountHolderName] = useState(row.accountHolderName ?? '')
  const [iban, setIban] = useState(row.iban ?? '')
  const [phone, setPhone] = useState(row.phone ?? '')
  const [city, setCity] = useState(row.city ?? '')
  const [baseAmount, setBaseAmount] = useState(String(row.baseAmount || ''))
  const [commissionAmount, setCommissionAmount] = useState(String(row.commissionAmount || ''))
  const [totalAmount, setTotalAmount] = useState(String(row.totalAmount || ''))
  const [currency, setCurrency] = useState<'SAR' | 'USD'>(row.currency)
  const [dueOn, setDueOn] = useState(row.dueOn ?? '')
  const [totalTouched, setTotalTouched] = useState(row.overrides.totalAmount != null)

  function syncTotal(nextBase: string, nextCommission: string) {
    if (totalTouched) return
    const base = Number(nextBase)
    const commission = Number(nextCommission)
    if (!Number.isFinite(base) || !Number.isFinite(commission)) return
    setTotalAmount(String(Math.round((base + commission) * 100) / 100))
  }

  function validateLocal(): string | null {
    if (!method) return 'Pick PayPal or Direct deposit.'
    if (method === 'paypal') {
      if (!paypalEmail.trim() && !paypalUsername.trim()) {
        return 'Add a PayPal email or username.'
      }
      return null
    }
    if (!accountHolderName.trim()) return 'Full name is required for direct deposit.'
    if (!city.trim()) return 'City is required for direct deposit.'
    if (!phone.trim()) return 'Phone number is required for direct deposit.'
    if (!bankName.trim()) return 'Bank name is required for direct deposit.'
    if (!iban.trim()) return 'IBAN is required for direct deposit.'
    return null
  }

  function save() {
    const localError = validateLocal()
    if (localError) {
      setError(localError)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await saveCreatorPayout({
        creatorId: row.creatorId,
        payerGroup,
        method: method || null,
        paypalEmail,
        paypalUsername,
        bankName,
        accountHolderName,
        iban,
        phone,
        city,
        baseAmount: baseAmount.trim() === '' ? null : Number(baseAmount),
        commissionAmount: commissionAmount.trim() === '' ? null : Number(commissionAmount),
        totalAmount: totalAmount.trim() === '' ? null : Number(totalAmount),
        currency,
        dueOn: dueOn || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{row.name}</h3>
          <p className="text-xs text-muted-foreground">
            Pick how to pay them, fill the details, then save.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Under</p>
          <div className="grid grid-cols-2 gap-2">
            {(['yahya', 'ahmed'] as const).map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setPayerGroup(group)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                  payerGroup === group
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                {group === 'yahya' ? 'Yahya' : 'Ahmed'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">How to send (required)</p>
          <MethodPicker value={method} onChange={setMethod} />
        </div>

        {method === 'paypal' ? (
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="mb-3 text-sm font-semibold">PayPal info</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                PayPal email
                <input
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  className={inputClass}
                  placeholder="name@email.com"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Or PayPal username
                <input
                  value={paypalUsername}
                  onChange={(e) => setPaypalUsername(e.target.value)}
                  className={inputClass}
                  placeholder="@username"
                  autoComplete="off"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">At least one of email or username.</p>
          </div>
        ) : null}

        {method === 'bank' ? (
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <p className="mb-3 text-sm font-semibold">Direct deposit info</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Full name
                <input
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className={inputClass}
                  placeholder="Name on the account"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                City
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                  placeholder="City name"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Phone number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+966…"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Bank name
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className={inputClass}
                  placeholder="Bank name"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                IBAN
                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className={inputClass}
                  placeholder="SA…"
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        ) : null}

        {!method ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Choose PayPal or Direct deposit to enter their payment details.
          </p>
        ) : null}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-sm font-semibold">Amount to pay</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Base
            <input
              type="number"
              min={0}
              step="0.01"
              value={baseAmount}
              onChange={(e) => {
                setBaseAmount(e.target.value)
                syncTotal(e.target.value, commissionAmount)
              }}
              className={inputClass}
            />
            <span className="text-[10px]">
              From app: {moneyLabel(row.defaults.baseAmount, row.defaults.currency)}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Commission
            <input
              type="number"
              min={0}
              step="0.01"
              value={commissionAmount}
              onChange={(e) => {
                setCommissionAmount(e.target.value)
                syncTotal(baseAmount, e.target.value)
              }}
              className={inputClass}
            />
            <span className="text-[10px]">
              From app: {moneyLabel(row.defaults.commissionAmount, row.defaults.currency)}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Total
            <input
              type="number"
              min={0}
              step="0.01"
              value={totalAmount}
              onChange={(e) => {
                setTotalTouched(true)
                setTotalAmount(e.target.value)
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'SAR' | 'USD')}
              className={inputClass}
            >
              <option value="SAR">Riyal (SAR)</option>
              <option value="USD">Dollars (USD)</option>
            </select>
          </label>
        </div>
        <label className="mt-3 flex max-w-xs flex-col gap-1 text-xs text-muted-foreground">
          Payment due
          <input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className={inputClass}
          />
          {row.defaults.dueOn ? (
            <span className="text-[10px]">From app: {formatWeekdayDate(row.defaults.dueOn)}</span>
          ) : (
            <span className="text-[10px]">No scheduled due date on file</span>
          )}
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await removeCreatorPayout({ creatorId: row.creatorId })
              router.refresh()
              onClose()
            })
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-destructive disabled:opacity-60"
        >
          Remove from list
        </button>
      </div>
    </div>
  )
}

function GroupList({
  title,
  rows,
  selectedId,
  onSelect,
  onMove,
  otherGroup,
  otherLabel,
}: {
  title: string
  rows: CreatorPayoutRow[]
  selectedId: number | null
  onSelect: (id: number) => void
  onMove: (id: number, group: PayerGroup) => void
  otherGroup: PayerGroup
  otherLabel: string
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Nobody here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.creatorId} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onSelect(row.creatorId)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  selectedId === row.creatorId
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <RowSummary row={row} />
              </button>
              <div className="flex justify-end px-1">
                <button
                  type="button"
                  onClick={() => onMove(row.creatorId, otherGroup)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  Move to {otherLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddCreatorPanel({
  candidates,
  pending,
  onAdd,
}: {
  candidates: CreatorPayoutCandidate[]
  pending: boolean
  onAdd: (creatorId: number, payerGroup: PayerGroup) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState<CreatorPayoutCandidate | null>(null)
  const [payerGroup, setPayerGroup] = useState<PayerGroup>('yahya')
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.slice(0, 8)
    return candidates.filter((person) => person.name.toLowerCase().includes(q)).slice(0, 12)
  }, [candidates, query])

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(person: CreatorPayoutCandidate) {
    setPicked(person)
    setQuery(person.name)
    setOpen(false)
    setError(null)
  }

  function clearPick() {
    setPicked(null)
    setQuery('')
    setError(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, Math.max(0, matches.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const person = matches[active]
      if (person) pick(person)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function submit() {
    if (!picked) {
      setError('Pick a creator from the list — you can’t type a free name.')
      setOpen(true)
      inputRef.current?.focus()
      return
    }
    onAdd(picked.creatorId, payerGroup)
    clearPick()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">Add someone</p>
        <p className="text-xs text-muted-foreground">
          Search by name, pick them from the list, choose Yahya or Ahmed, then add their payment info.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div ref={rootRef} className="relative min-w-0">
          <label className="mb-1 block text-xs text-muted-foreground">Search creator by name</label>
          <div className="relative">
            <input
              ref={inputRef}
              type="search"
              value={query}
              autoComplete="off"
              placeholder="Type a name, then pick from the list…"
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value)
                setPicked(null)
                setOpen(true)
                setError(null)
              }}
              onKeyDown={onKeyDown}
              className={inputClass}
            />
            {picked || query ? (
              <button
                type="button"
                onClick={clearPick}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>

          {picked ? (
            <p className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Selected: <span className="font-semibold">{picked.name}</span>
              <span className="ms-2 text-xs uppercase tracking-wide text-muted-foreground">
                {picked.role === 'reposter' ? 'reposter' : 'creator'}
              </span>
            </p>
          ) : null}

          {open && !picked ? (
            <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  {query.trim() ? 'No match on the site.' : 'Nobody left to add.'}
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto py-1">
                  {matches.map((person, i) => (
                    <li key={person.creatorId}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => pick(person)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                          i === active ? 'bg-accent' : 'hover:bg-accent/60'
                        }`}
                      >
                        <span className="font-medium">{person.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {person.role === 'reposter' ? 'reposter' : 'creator'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Attach under</p>
            <div className="grid grid-cols-2 gap-2">
              {(['yahya', 'ahmed'] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setPayerGroup(group)}
                  className={`h-10 rounded-lg border px-3 text-sm font-medium ${
                    payerGroup === group
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  {group === 'yahya' ? 'Yahya' : 'Ahmed'}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function CreatorPayoutsBoard({ board }: { board: CreatorPayoutBoard }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selected = useMemo(() => {
    return [...board.yahya, ...board.ahmed].find((row) => row.creatorId === selectedId) ?? null
  }, [board, selectedId])

  function move(creatorId: number, payerGroup: PayerGroup) {
    startTransition(async () => {
      await assignCreatorPayout({ creatorId, payerGroup })
      router.refresh()
    })
  }

  function add(creatorId: number, payerGroup: PayerGroup) {
    startTransition(async () => {
      const res = await assignCreatorPayout({ creatorId, payerGroup })
      if (!res.ok) return
      setSelectedId(creatorId)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{board.filledCount}</span> filled
        </span>
        <span>·</span>
        <span>
          <span className="font-medium text-foreground">{board.missingCount}</span> missing info
        </span>
      </div>

      <AddCreatorPanel candidates={board.candidates} pending={pending} onAdd={add} />

      {selected ? (
        <EditForm key={selected.creatorId} row={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Tap someone under Yahya or Ahmed to add PayPal or direct deposit details.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupList
          title="Under Yahya"
          rows={board.yahya}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={move}
          otherGroup="ahmed"
          otherLabel="Ahmed"
        />
        <GroupList
          title="Under Ahmed"
          rows={board.ahmed}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={move}
          otherGroup="yahya"
          otherLabel="Yahya"
        />
      </div>
    </div>
  )
}
