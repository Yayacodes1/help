'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignCreatorPayout,
  removeCreatorPayout,
  saveCreatorPayout,
} from '@/app/actions/creator-payouts'
import { formatMoney, formatWeekdayDate } from '@/lib/format'
import type {
  CreatorPayoutBoard,
  CreatorPayoutRow,
  PayerGroup,
  PayoutMethod,
} from '@/lib/creator-payouts-types'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function moneyLabel(amount: number, currency: 'SAR' | 'USD') {
  return formatMoney(amount, currency)
}

function RowSummary({ row }: { row: CreatorPayoutRow }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            row.infoFilled
              ? 'bg-primary/15 text-primary'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
          }`}
        >
          {row.infoFilled ? 'Filled' : 'Missing'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {row.method === 'paypal' ? 'PayPal' : row.method === 'bank' ? 'Bank' : 'No method'}
        </span>
      </div>
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

  function save() {
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{row.name}</h3>
          <p className="text-xs text-muted-foreground">
            Prefills from their contract / schedule. Edit anything before paying.
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Under
          <select
            value={payerGroup}
            onChange={(e) => setPayerGroup(e.target.value as PayerGroup)}
            className={inputClass}
          >
            <option value="yahya">Yahya</option>
            <option value="ahmed">Ahmed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          How to send
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod | '')}
            className={inputClass}
          >
            <option value="">Not set</option>
            <option value="paypal">PayPal</option>
            <option value="bank">Direct deposit / bank</option>
          </select>
        </label>
      </div>

      {method === 'paypal' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            PayPal email
            <input
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className={inputClass}
              placeholder="name@email.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            PayPal username
            <input
              value={paypalUsername}
              onChange={(e) => setPaypalUsername(e.target.value)}
              className={inputClass}
              placeholder="@username"
            />
          </label>
        </div>
      ) : null}

      {method === 'bank' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Bank name
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Full name
            <input
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            IBAN
            <input value={iban} onChange={(e) => setIban(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </label>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-3">
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
        <p className="text-sm text-muted-foreground">Nobody here yet.</p>
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

export function CreatorPayoutsBoard({ board }: { board: CreatorPayoutBoard }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [addGroup, setAddGroup] = useState<PayerGroup>('yahya')
  const [addId, setAddId] = useState('')
  const [query, setQuery] = useState('')

  const selected = useMemo(() => {
    return [...board.yahya, ...board.ahmed].find((row) => row.creatorId === selectedId) ?? null
  }, [board, selectedId])

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return board.candidates
    return board.candidates.filter((person) => person.name.toLowerCase().includes(q))
  }, [board.candidates, query])

  function move(creatorId: number, payerGroup: PayerGroup) {
    startTransition(async () => {
      await assignCreatorPayout({ creatorId, payerGroup })
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

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-sm font-semibold">Add someone</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Search people on the site
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a name…"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:w-56">
            Person
            <select
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              className={inputClass}
            >
              <option value="">Pick…</option>
              {filteredCandidates.map((person) => (
                <option key={person.creatorId} value={person.creatorId}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:w-36">
            Under
            <select
              value={addGroup}
              onChange={(e) => setAddGroup(e.target.value as PayerGroup)}
              className={inputClass}
            >
              <option value="yahya">Yahya</option>
              <option value="ahmed">Ahmed</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !addId}
            onClick={() => {
              const creatorId = Number(addId)
              if (!creatorId) return
              startTransition(async () => {
                await assignCreatorPayout({ creatorId, payerGroup: addGroup })
                setAddId('')
                setSelectedId(creatorId)
                router.refresh()
              })
            }}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>

      {selected ? <EditForm key={selected.creatorId} row={selected} onClose={() => setSelectedId(null)} /> : null}

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
