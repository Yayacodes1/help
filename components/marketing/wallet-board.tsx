'use client'

import { Fragment, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDate, formatMoney } from '@/lib/format'
import { SAR_PER_USD } from '@/lib/fx'
import { adminPersonHref } from '@/lib/admin-href'
import type { MarketingRequest, MarketingRequestItem } from '@/lib/marketing'
import type { WalletContract, WalletEntry, WalletPerson, WalletTotals } from '@/lib/wallet'
import type { PaymentDueRow } from '@/lib/queries'
import {
  cancelMarketingRequest,
  createMarketingExpense,
  createMarketingTransfer,
  createMoneyRequest,
  deleteMarketingExpense,
  deleteMarketingTransfer,
  deleteWalletAdjustment,
  fulfillMarketingRequest,
  recordWalletPayments,
  setWalletBalance,
} from '@/app/actions/marketing'
import { deletePayment } from '@/app/actions/admin'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const primaryBtn =
  'h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60'
const ghostBtn = 'h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-60'

type RequestWithItems = MarketingRequest & { items: MarketingRequestItem[] }
type Action = 'pay' | 'spend' | 'ask' | 'send' | 'count' | null
type Who = 'reposter' | 'creator' | 'all'
type LedgerFilter = 'all' | 'in' | 'pay' | 'spend' | 'adjust'

const round2 = (n: number) => Math.round(n * 100) / 100
const sarMoney = (n: number) => formatMoney(n, 'SAR')
const inSar = (amount: number, currency: string) => round2(currency === 'USD' ? amount * SAR_PER_USD : amount)
const byName = (id: string | null) =>
  id === 'yahya' ? 'Yahya' : id === 'ahmed' ? 'Ahmed' : id ? id : '—'

export function WalletBoard({
  today,
  isOwner,
  totals,
  entries,
  requests,
  people,
  due,
}: {
  today: string
  isOwner: boolean
  totals: WalletTotals
  entries: WalletEntry[]
  requests: RequestWithItems[]
  people: WalletPerson[]
  /** Everyone still owed money (all projects). */
  due: PaymentDueRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState<Action>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const w = totals

  const dueById = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of due) {
      if (row.settled || row.balance <= 0) continue
      map.set(row.creatorId, round2((map.get(row.creatorId) ?? 0) + row.balance))
    }
    return map
  }, [due])

  const openRequests = requests.filter((r) => r.status === 'open')
  const pastRequests = requests.filter((r) => r.status !== 'open')

  function done(message: string) {
    setFlash(message)
    setAction(null)
    router.refresh()
  }

  const actions: Array<{ id: Exclude<Action, null>; label: string; show: boolean }> = [
    { id: 'pay', label: 'Pay people', show: true },
    { id: 'spend', label: 'Log other spend', show: true },
    { id: 'ask', label: isOwner ? 'New money request' : 'Ask Yahya for money', show: true },
    { id: 'send', label: 'Send money to Ahmed', show: isOwner },
    { id: 'count', label: isOwner ? 'Set what Ahmed has' : 'How much I have', show: true },
  ]

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Sent to Ahmed"
          value={sarMoney(w.sent)}
          hint={
            Math.abs(w.adjusted) > 0.009
              ? `All money Yahya sent · ${w.adjusted > 0 ? '+' : '−'}${sarMoney(Math.abs(w.adjusted))} from Ahmed’s counts`
              : 'All money Yahya sent'
          }
        />
        <Tile
          label="Asked, not sent yet"
          value={sarMoney(w.waiting)}
          hint={`${openRequests.length} open request${openRequests.length === 1 ? '' : 's'}`}
          tone={w.waiting > 0 ? 'warn' : undefined}
        />
        <Tile
          label="Spent"
          value={sarMoney(w.spentPayments + w.spentOther)}
          hint={`People ${sarMoney(w.spentPayments)} · Other ${sarMoney(w.spentOther)}`}
        />
        <Tile
          label="Ahmed has now"
          value={sarMoney(w.left)}
          hint={
            w.lastCount
              ? `Counted ${sarMoney(w.lastCount.amount)} on ${formatDate(w.lastCount.on)}, then the app takes off what he pays`
              : w.left < 0
                ? 'Spent more than was sent'
                : 'Sent − spent'
          }
          tone={w.left < 0 ? 'bad' : 'good'}
        />
      </section>
      <p className="-mt-2 text-xs text-muted-foreground">
        Everything is in riyals (dollars count as {SAR_PER_USD} SAR). Use “How much I have” to set the real amount
        any time. Every payment Ahmed logs comes out of his wallet in that person’s currency. Only Yahya can record
        or change money sent to Ahmed.
      </p>

      <div className="flex flex-wrap gap-2">
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setFlash(null)
                setAction((cur) => (cur === a.id ? null : a.id))
              }}
              className={
                action === a.id
                  ? 'h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background'
                  : 'h-10 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted'
              }
            >
              {a.label}
            </button>
          ))}
      </div>
      {flash && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {flash}
        </p>
      )}

      {action === 'pay' && (
        <PayPeopleForm
          today={today}
          isOwner={isOwner}
          people={people}
          dueById={dueById}
          left={w.left}
          pending={pending}
          onSubmit={(input) =>
            startTransition(async () => {
              const res = await recordWalletPayments(input)
              if (!res.ok) {
                setFlash(null)
                alert(res.error)
                return
              }
              done(
                `Recorded ${res.count} payment${res.count === 1 ? '' : 's'} · ${sarMoney(res.total)}${
                  res.fromWallet ? ' from Ahmed’s wallet' : ' (paid directly by Yahya)'
                }`,
              )
            })
          }
        />
      )}
      {action === 'spend' && (
        <SimpleMoneyForm
          title="Log other spend"
          hint="Ads, boosts, tools — anything that isn’t paying a creator or reposter."
          dateName="spent_on"
          labelText="What was it for?"
          labelPlaceholder="Instagram ads"
          submitText="Add spend"
          today={today}
          pending={pending}
          onSubmit={(fd) =>
            startTransition(async () => {
              await createMarketingExpense(fd)
              done(`Logged ${formatMoney(Number(fd.get('amount')) || 0, String(fd.get('currency') || 'SAR'))} spend`)
            })
          }
        />
      )}
      {action === 'ask' && (
        <AskForm
          people={people}
          dueById={dueById}
          pending={pending}
          onSubmit={(input) =>
            startTransition(async () => {
              const res = await createMoneyRequest(input)
              if (!res.ok) {
                alert(res.error)
                return
              }
              done(`Request sent · ${formatMoney(res.total, input.currency)}`)
            })
          }
        />
      )}
      {action === 'count' && (
        <BalanceForm
          today={today}
          isOwner={isOwner}
          totals={totals}
          pending={pending}
          onSubmit={(fd) =>
            startTransition(async () => {
              const res = await setWalletBalance(fd)
              if (!res.ok) {
                alert(res.error)
                return
              }
              const change =
                Math.abs(res.diff) < 0.009
                  ? 'already matched'
                  : `${res.diff > 0 ? '+' : '−'}${formatMoney(Math.abs(res.diff), res.currency)} fix`
              done(`Ahmed has ${formatMoney(res.counted, res.currency)} · ${change}`)
            })
          }
        />
      )}
      {action === 'send' && isOwner && (
        <SimpleMoneyForm
          title="Send money to Ahmed"
          hint="Record money you sent him. It is added to what he has left."
          dateName="sent_on"
          labelText="Label"
          labelPlaceholder="October budget"
          submitText="Record money sent"
          today={today}
          pending={pending}
          onSubmit={(fd) =>
            startTransition(async () => {
              await createMarketingTransfer(fd)
              done(`Recorded ${formatMoney(Number(fd.get('amount')) || 0, String(fd.get('currency') || 'SAR'))} sent to Ahmed`)
            })
          }
        />
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">
          Money requests {openRequests.length > 0 ? `· ${openRequests.length} open` : ''}
        </h3>
        {openRequests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No open requests.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {openRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {formatMoney(r.total_amount, r.currency)} · {r.title || `Request #${r.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Asked by {byName(r.recorded_by)} ·{' '}
                      {r.needed_by ? `needed by ${formatDate(r.needed_by)}` : 'no due date'}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                  </div>
                  {!isOwner && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Waiting for Yahya
                    </span>
                  )}
                </div>
                <RequestItems items={r.items} currency={r.currency} />
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form
                    action={(fd) =>
                      startTransition(async () => {
                        await fulfillMarketingRequest(r.id, fd)
                        const amount = Number(fd.get('amount')) || r.total_amount
                        done(
                          `Marked ${formatMoney(amount, r.currency)} as ${isOwner ? 'sent to Ahmed' : 'received'}`,
                        )
                      })
                    }
                    className="flex flex-wrap items-end gap-2"
                  >
                    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                      {isOwner ? 'Amount sent' : 'Amount received'} ({r.currency})
                      <input
                        type="number"
                        name="amount"
                        min={0}
                        step="0.01"
                        required
                        defaultValue={r.total_amount}
                        className={`${inputClass} w-32 text-right tabular-nums`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                      {isOwner ? 'Sent on' : 'Received on'}
                      <input type="date" name="sent_on" defaultValue={today} className={inputClass} />
                    </label>
                    <input type="hidden" name="note" value="" />
                    <button type="submit" disabled={pending} className={primaryBtn}>
                      {isOwner ? 'I sent it' : 'I received it'}
                    </button>
                  </form>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Cancel this request?'))
                        startTransition(async () => {
                          await cancelMarketingRequest(r.id)
                          router.refresh()
                        })
                    }}
                    className={ghostBtn}
                  >
                    {isOwner ? 'Decline' : 'Cancel request'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pastRequests.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Past requests ({pastRequests.length})
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {pastRequests.map((r) => (
                <li key={r.id}>
                  <span
                    className={
                      r.status === 'fulfilled'
                        ? 'font-medium text-emerald-600 dark:text-emerald-400'
                        : 'font-medium'
                    }
                  >
                    {r.status === 'fulfilled' ? 'Received' : 'Cancelled'}
                  </span>{' '}
                  ·{' '}
                  {r.status === 'fulfilled' &&
                  r.received_amount != null &&
                  Math.abs(r.received_amount - r.total_amount) > 0.009
                    ? `${formatMoney(r.received_amount, r.currency)} of ${formatMoney(r.total_amount, r.currency)} asked`
                    : formatMoney(r.total_amount, r.currency)}{' '}
                  · {r.title || `#${r.id}`}
                  {r.recorded_by ? ` · by ${byName(r.recorded_by)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Ledger
        entries={entries}
        totals={totals}
        isOwner={isOwner}
        pending={pending}
        onDelete={(e) => {
          if (!confirm(`Delete “${e.label}” (${sarMoney(e.sar)})?`)) return
          startTransition(async () => {
            if (e.kind === 'in') await deleteMarketingTransfer(e.id)
            else if (e.kind === 'adjust') await deleteWalletAdjustment(e.id)
            else if (e.kind === 'spend') await deleteMarketingExpense(e.id)
            else if (e.creatorId != null) await deletePayment(e.id, e.creatorId)
            router.refresh()
          })
        }}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'good' | 'bad' | 'warn'
}) {
  const color =
    tone === 'bad'
      ? 'text-destructive'
      : tone === 'good'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warn'
          ? 'text-amber-600 dark:text-amber-400'
          : ''
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function RequestItems({ items, currency }: { items: MarketingRequestItem[]; currency: string }) {
  const shown = items.slice(0, 6)
  const rest = items.slice(6)
  const row = (item: MarketingRequestItem) => (
    <li key={item.id} className="flex justify-between gap-3">
      <span>{item.reason}</span>
      <span className="tabular-nums">{formatMoney(item.amount, currency)}</span>
    </li>
  )
  return (
    <div className="mt-2 text-sm text-muted-foreground">
      <ul className="space-y-0.5">{shown.map(row)}</ul>
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs">+{rest.length} more</summary>
          <ul className="mt-1 space-y-0.5">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  )
}

function contractStatus(c: WalletContract): { short: string; label: string; tone: string } {
  if (c.agreed > 0 && c.paid >= c.agreed - 0.009) {
    return { short: 'paid ✓', label: 'Paid in full', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
  }
  if (c.paid > 0) {
    return { short: 'part paid', label: 'Partly paid', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
  }
  return { short: 'not paid', label: 'Not paid yet', tone: 'bg-destructive/10 text-destructive' }
}

function ContractCard({ person }: { person: WalletPerson }) {
  const c = person.contract
  const href = adminPersonHref(person.id, { role: person.role, panel: 'contracts', from: 'marketing' })
  if (!c) {
    return (
      <p className="text-xs text-muted-foreground">
        No contract yet.{' '}
        <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
          Open their page
        </Link>
      </p>
    )
  }
  const money = (n: number) => formatMoney(n, person.currency)
  const status = contractStatus(c)
  const leftToPay = Math.max(0, round2(c.agreed - c.paid))
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{c.name}</span>
        <span className="text-muted-foreground">
          {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : 'open'}
          {c.active ? '' : ' · ended'}
        </span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      <p className="tabular-nums">
        Agreed {c.agreed > 0 ? money(c.agreed) : 'not set'} · Paid {money(c.paid)}
        {c.payments > 0 ? ` (${c.payments} payment${c.payments === 1 ? '' : 's'}, last ${formatDate(c.lastPaidOn!)})` : ''}
        {c.agreed > 0 ? ` · Left to pay ${money(leftToPay)}` : ''}
      </p>
      <Link href={href} className="self-start font-medium underline-offset-4 hover:underline">
        Open the contract →
      </Link>
    </div>
  )
}

function PayPeopleForm({
  today,
  isOwner,
  people,
  dueById,
  left,
  pending,
  onSubmit,
}: {
  today: string
  isOwner: boolean
  people: WalletPerson[]
  dueById: Map<number, number>
  left: number
  pending: boolean
  onSubmit: (input: {
    paidOn: string
    note: string
    paidFrom: 'ahmed' | 'direct'
    entries: Array<{ creatorId: number; amount: number }>
  }) => void
}) {
  const hasDueReposters = people.some((p) => p.role === 'reposter' && dueById.has(p.id))
  const [who, setWho] = useState<Who>('reposter')
  const [onlyDue, setOnlyDue] = useState(hasDueReposters)
  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const p of people) {
      const d = dueById.get(p.id)
      if (d) init[p.id] = String(d)
    }
    return init
  })
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(people.filter((p) => p.role === 'reposter' && dueById.has(p.id)).map((p) => p.id)),
  )
  const [same, setSame] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [paidFrom, setPaidFrom] = useState<'ahmed' | 'direct'>('ahmed')

  const visible = people.filter(
    (p) => (who === 'all' || p.role === who) && (!onlyDue || dueById.has(p.id)),
  )
  const [openContract, setOpenContract] = useState<number | null>(null)
  const selected = people.filter((p) => checked.has(p.id) && Number(amounts[p.id]) > 0)
  const total = round2(selected.reduce((s, p) => s + inSar(Number(amounts[p.id]) || 0, p.currency), 0))
  const fromWallet = !isOwner || paidFrom === 'ahmed'
  const overBudget = fromWallet && total > left + 0.001

  function toggle(id: number, on: boolean) {
    setChecked((cur) => {
      const next = new Set(cur)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function setAll(on: boolean) {
    setChecked((cur) => {
      const next = new Set(cur)
      for (const p of visible) {
        if (on) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }
  function applySame() {
    const v = Number(same)
    if (!(v > 0)) return
    setAmounts((cur) => {
      const next = { ...cur }
      for (const p of visible) next[p.id] = String(v)
      return next
    })
    setAll(true)
  }
  function useDue() {
    setAmounts((cur) => {
      const next = { ...cur }
      for (const p of visible) {
        const d = dueById.get(p.id)
        next[p.id] = d ? String(d) : ''
      }
      return next
    })
    setChecked((cur) => {
      const next = new Set(cur)
      for (const p of visible) {
        if (dueById.has(p.id)) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Pay people</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Everyone owed money is ticked with what they’re owed. Change amounts, untick anyone, then
        record it all at once.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['reposter', 'creator', 'all'] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWho(w)}
            className={
              who === w
                ? 'h-8 rounded-full bg-foreground px-3 text-xs font-semibold text-background'
                : 'h-8 rounded-full border border-border px-3 text-xs'
            }
          >
            {w === 'reposter' ? 'Reposters' : w === 'creator' ? 'Creators' : 'Everyone'}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
          Only people owed money
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Same amount for everyone shown
          <input
            type="number"
            min={0}
            step="0.01"
            value={same}
            onChange={(e) => setSame(e.target.value)}
            placeholder="e.g. 50"
            className={`${inputClass} w-36`}
          />
        </label>
        <button type="button" onClick={applySame} className={ghostBtn}>
          Apply to all
        </button>
        <button type="button" onClick={useDue} className={ghostBtn}>
          Use amount owed
        </button>
        <button type="button" onClick={() => setAll(true)} className={ghostBtn}>
          Tick all
        </button>
        <button type="button" onClick={() => setAll(false)} className={ghostBtn}>
          Untick all
        </button>
      </div>

      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-lg border border-border">
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {onlyDue ? 'Nobody here is owed money right now.' : 'Nobody to show.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="w-10 px-2 py-2" />
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-right font-medium">Owed</th>
                <th className="w-40 px-2 py-2 text-right font-medium">Pay</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const owed = dueById.get(p.id)
                const open = openContract === p.id
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-border">
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked.has(p.id)}
                          onChange={(e) => toggle(p.id, e.target.checked)}
                          aria-label={`Pay ${p.name}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {p.name}
                        {who === 'all' && (
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground">{p.role}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenContract(open ? null : p.id)}
                          className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] ${
                            open ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground'
                          }`}
                        >
                          Contract{p.contract ? ` · ${contractStatus(p.contract).short}` : ''}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {owed ? formatMoney(owed, p.currency) : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={amounts[p.id] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setAmounts((cur) => ({ ...cur, [p.id]: v }))
                              if (Number(v) > 0) toggle(p.id, true)
                            }}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                          />
                          <span className="w-8 text-[10px] font-semibold text-muted-foreground">{p.currency}</span>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-muted/40">
                        <td colSpan={4} className="px-3 py-2">
                          <ContractCard person={p} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Paid on
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Week 3 payout, sent by Zelle"
            className={inputClass}
          />
        </label>
        {isOwner && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-3">
            Who sent the money?
            <select
              value={paidFrom}
              onChange={(e) => setPaidFrom(e.target.value as 'ahmed' | 'direct')}
              className={inputClass}
            >
              <option value="ahmed">Ahmed, from the money I gave him</option>
              <option value="direct">I paid them myself (not from Ahmed’s wallet)</option>
            </select>
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{sarMoney(total)}</span> to{' '}
          {selected.length} {selected.length === 1 ? 'person' : 'people'}
          {fromWallet && (
            <span className={overBudget ? 'ml-2 text-destructive' : 'ml-2 text-muted-foreground'}>
              · Ahmed has {sarMoney(left)}
              {overBudget ? ` — ${sarMoney(total - left)} more than he has` : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={() => {
            if (overBudget && !confirm('This is more than Ahmed has left. Record anyway?')) return
            onSubmit({
              paidOn,
              note,
              paidFrom,
              entries: selected.map((p) => ({ creatorId: p.id, amount: Number(amounts[p.id]) || 0 })),
            })
          }}
          className={primaryBtn}
        >
          {pending ? 'Saving…' : `Record ${selected.length} payment${selected.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  )
}

type AskLine = { key: number; reason: string; amount: string }

function AskForm({
  people,
  dueById,
  pending,
  onSubmit,
}: {
  people: WalletPerson[]
  dueById: Map<number, number>
  pending: boolean
  onSubmit: (input: {
    title: string
    neededBy: string | null
    currency: string
    note: string
    items: Array<{ reason: string; amount: number }>
  }) => void
}) {
  const nextKey = useRef(1)
  const [lines, setLines] = useState<AskLine[]>([{ key: 0, reason: '', amount: '' }])
  const [title, setTitle] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [currency, setCurrency] = useState('SAR')
  const [note, setNote] = useState('')

  const total = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0))

  function fillDue(role: Who) {
    const owed = people
      .filter((p) => (role === 'all' || p.role === role) && dueById.has(p.id))
      .map((p) => ({ key: nextKey.current++, reason: `Pay ${p.name}`, amount: String(dueById.get(p.id)) }))
    if (owed.length === 0) {
      alert('Nobody is owed money right now.')
      return
    }
    setLines((cur) => [...cur.filter((l) => l.reason.trim() || Number(l.amount) > 0), ...owed])
    if (!title) setTitle(role === 'reposter' ? 'Reposter payouts' : role === 'creator' ? 'Creator payouts' : 'Payouts')
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Ask for money</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Say what it’s for and how much. Yahya sees it right here and marks it sent.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => fillDue('reposter')} className={ghostBtn}>
          Add reposters owed money
        </button>
        <button type="button" onClick={() => fillDue('creator')} className={ghostBtn}>
          Add creators owed money
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 3 payouts" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Needed by
          <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            <option value="SAR">SAR (﷼)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-[1fr_8rem_2.5rem] gap-2">
            <input
              value={l.reason}
              onChange={(e) =>
                setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, reason: e.target.value } : x)))
              }
              placeholder={i === 0 ? 'What is it for? e.g. Instagram ads' : 'What is it for?'}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={l.amount}
              onChange={(e) =>
                setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))
              }
              placeholder="Amount"
              className={`${inputClass} text-right tabular-nums`}
            />
            <button
              type="button"
              aria-label="Remove line"
              onClick={() =>
                setLines((cur) =>
                  cur.length === 1 ? [{ key: nextKey.current++, reason: '', amount: '' }] : cur.filter((x) => x.key !== l.key),
                )
              }
              className="h-10 rounded-lg border border-border text-muted-foreground hover:bg-muted"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((cur) => [...cur, { key: nextKey.current++, reason: '', amount: '' }])}
          className={`${ghostBtn} self-start`}
        >
          + Add line
        </button>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything Yahya should know" className={inputClass} />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Total <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </span>
        <button
          type="button"
          disabled={pending || total <= 0}
          onClick={() =>
            onSubmit({
              title,
              neededBy: neededBy || null,
              currency,
              note,
              items: lines.map((l) => ({ reason: l.reason, amount: Number(l.amount) || 0 })),
            })
          }
          className={primaryBtn}
        >
          {pending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </section>
  )
}

function SimpleMoneyForm({
  title,
  hint,
  dateName,
  labelText,
  labelPlaceholder,
  submitText,
  today,
  pending,
  onSubmit,
}: {
  title: string
  hint: string
  dateName: string
  labelText: string
  labelPlaceholder: string
  submitText: string
  today: string
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <form action={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Amount
          <input type="number" name="amount" min={0} step="0.01" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Currency
          <select name="currency" defaultValue="SAR" className={inputClass}>
            <option value="SAR">SAR (﷼)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          {labelText}
          <input name="label" required={dateName === 'spent_on'} placeholder={labelPlaceholder} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <input type="date" name={dateName} required defaultValue={today} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-3">
          Note (optional)
          <input name="note" className={inputClass} />
        </label>
        <button type="submit" disabled={pending} className={`${primaryBtn} sm:col-span-4`}>
          {pending ? 'Saving…' : submitText}
        </button>
      </form>
    </section>
  )
}

function Ledger({
  entries,
  totals,
  isOwner,
  pending,
  onDelete,
}: {
  entries: WalletEntry[]
  totals: WalletTotals
  isOwner: boolean
  pending: boolean
  onDelete: (e: WalletEntry) => void
}) {
  const [filter, setFilter] = useState<LedgerFilter>('all')

  /** Balance (SAR) right after each entry, walking back from today's balance. */
  const leftAfter = useMemo(() => {
    let running = totals.left
    const out = new Map<string, number>()
    for (const e of entries) {
      out.set(e.key, running)
      running = round2(e.kind === 'in' || e.kind === 'adjust' ? running - e.sar : running + e.sar)
    }
    return out
  }, [entries, totals])

  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter)
  const chips: Array<{ id: LedgerFilter; label: string }> = [
    { id: 'all', label: 'Everything' },
    { id: 'in', label: 'Money in' },
    { id: 'pay', label: 'Paid people' },
    { id: 'spend', label: 'Other spend' },
    { id: 'adjust', label: 'Ahmed’s counts' },
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">History</h3>
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={
                filter === c.id
                  ? 'h-7 rounded-full bg-foreground px-3 text-xs font-semibold text-background'
                  : 'h-7 rounded-full border border-border px-3 text-xs'
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-2 text-left font-medium">Date</th>
                <th className="py-2 pr-2 text-left font-medium">What</th>
                <th className="py-2 pr-2 text-left font-medium">Logged by</th>
                <th className="py-2 pr-2 text-right font-medium">Amount</th>
                <th className="py-2 pr-2 text-right font-medium">Left after</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const canDelete = e.kind !== 'in' || isOwner
                return (
                  <tr key={e.key} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-2 pr-2 text-muted-foreground">{formatDate(e.date)}</td>
                    <td className="py-2 pr-2">
                      <span className="font-medium">{e.label}</span>
                      {e.note ? <span className="block text-xs text-muted-foreground">{e.note}</span> : null}
                      {e.kind === 'pay' && e.creatorId != null ? (
                        <Link
                          href={adminPersonHref(e.creatorId, { panel: 'contracts', from: 'marketing' })}
                          className="block text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                          {e.contractName ? `Contract: ${e.contractName}` : 'Not linked to a contract'} · open →
                        </Link>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">{byName(e.recordedBy)}</td>
                    <td
                      className={`whitespace-nowrap py-2 pr-2 text-right font-medium tabular-nums ${
                        e.kind === 'in' || (e.kind === 'adjust' && e.amount > 0)
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ''
                      }`}
                    >
                      {e.kind === 'in' || (e.kind === 'adjust' && e.amount >= 0) ? '+' : '−'}
                      {sarMoney(Math.abs(e.sar))}
                      {e.currency === 'USD' ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {formatMoney(Math.abs(e.amount), 'USD')}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums text-muted-foreground">
                      {sarMoney(leftAfter.get(e.key) ?? 0)}
                    </td>
                    <td className="py-2 text-right">
                      {canDelete && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onDelete(e)}
                          aria-label="Delete"
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function BalanceForm({
  today,
  isOwner,
  totals,
  pending,
  onSubmit,
}: {
  today: string
  isOwner: boolean
  totals: WalletTotals
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  const [currency, setCurrency] = useState<'USD' | 'SAR'>('SAR')
  const [amount, setAmount] = useState('')
  const left = totals.left
  const typed = Number(amount)
  const diff = amount.trim() !== '' && Number.isFinite(typed) ? round2(inSar(typed, currency) - left) : null
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{isOwner ? 'What Ahmed has' : 'How much I have'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isOwner ? 'Type what Ahmed has on his end right now.' : 'Type how much money you have on your end right now.'}{' '}
        From then on the app takes off whatever he pays. The app says{' '}
        <span className="font-medium text-foreground">{sarMoney(left)}</span> right now.
      </p>
      <form action={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Amount he has
          <input
            type="number"
            name="amount"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Currency
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value === 'USD' ? 'USD' : 'SAR')}
            className={inputClass}
          >
            <option value="SAR">SAR (﷼)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <input type="date" name="counted_on" required defaultValue={today} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Note (optional)
          <input name="note" placeholder="e.g. cash + bank" className={inputClass} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-4">
          <span className="text-xs text-muted-foreground">
            {diff == null
              ? ' '
              : Math.abs(diff) < 0.009
                ? 'Matches the app.'
                : `${diff > 0 ? 'Adds' : 'Takes off'} ${sarMoney(Math.abs(diff))}`}
          </span>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? 'Saving…' : 'Save amount'}
          </button>
        </div>
      </form>
    </section>
  )
}
