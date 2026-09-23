'use client'

import { useRef, useState, useTransition } from 'react'
import { formatDate, formatMoney } from '@/lib/format'
import type {
  MarketingBalance,
  MarketingExpense,
  MarketingRequest,
  MarketingRequestItem,
  MarketingTransfer,
} from '@/lib/marketing'
import {
  cancelMarketingRequest,
  createMarketingExpense,
  createMarketingRequest,
  createMarketingTransfer,
  deleteMarketingExpense,
  deleteMarketingTransfer,
  fulfillMarketingRequest,
  updateMarketingExpense,
  updateMarketingTransfer,
} from '@/app/actions/marketing'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

type RequestWithItems = MarketingRequest & { items: MarketingRequestItem[] }

export function MarketingBudgetBoard({
  today,
  balances,
  transfers,
  expenses,
  requests,
  projectId,
}: {
  today: string
  balances: MarketingBalance[]
  transfers: MarketingTransfer[]
  expenses: MarketingExpense[]
  requests: RequestWithItems[]
  /** Current header project — new rows are tagged to it. */
  projectId?: number | null
}) {
  const [pending, startTransition] = useTransition()
  const [editingTransfer, setEditingTransfer] = useState<number | null>(null)
  const [editingExpense, setEditingExpense] = useState<number | null>(null)
  const [reasonRows, setReasonRows] = useState(1)
  const transferFormRef = useRef<HTMLFormElement>(null)
  const expenseFormRef = useRef<HTMLFormElement>(null)
  const requestFormRef = useRef<HTMLFormElement>(null)
  const projectField =
    projectId != null ? (
      <input type="hidden" name="project_id" value={projectId} />
    ) : null

  const openRequests = requests.filter((r) => r.status === 'open')
  const pastRequests = requests.filter((r) => r.status !== 'open')

  return (
    <div className="flex flex-col gap-6">
      {projectId == null && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Showing all projects. Pick Miyqat or Notek in the header to add and view budget for one
          project only.
        </p>
      )}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {balances.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            No money sent yet. Use “Set up send payment” below.
          </div>
        ) : (
          balances.map((b) => (
            <div key={b.currency} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {b.currency} balance
              </p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(b.left, b.currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sent {formatMoney(b.sent, b.currency)} · Spent {formatMoney(b.spent, b.currency)}
              </p>
            </div>
          ))
        )}
      </section>

      {openRequests.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Money requests</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {openRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {r.title || `Request #${r.id}`} · {formatMoney(r.total_amount, r.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.needed_by ? `Needed by ${formatDate(r.needed_by)}` : 'No due date'}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={(fd) =>
                        startTransition(async () => {
                          await fulfillMarketingRequest(r.id, fd)
                        })
                      }
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                        Sent on
                        <input type="date" name="sent_on" defaultValue={today} className={inputClass} />
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] text-muted-foreground">
                        Note
                        <input name="note" placeholder="Optional" className={inputClass} />
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        Set up send payment
                      </button>
                    </form>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(() => cancelMarketingRequest(r.id))}
                      className="h-10 rounded-lg border border-border px-3 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {r.items.map((item) => (
                    <li key={item.id} className="text-muted-foreground">
                      {formatMoney(item.amount, r.currency)} — {item.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Set up send payment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Record money sent for marketing (USD or SAR). Log what it was used for below.
        </p>
        <form
          ref={transferFormRef}
          action={(fd) =>
            startTransition(async () => {
              await createMarketingTransfer(fd)
              transferFormRef.current?.reset()
            })
          }
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          {projectField}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sent on
            <input type="date" name="sent_on" required defaultValue={today} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Amount
            <input type="number" name="amount" min={0} step="0.01" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Currency
            <select name="currency" defaultValue="USD" className={inputClass}>
              <option value="USD">USD ($)</option>
              <option value="SAR">SAR (﷼)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Label
            <input name="label" placeholder="September budget" className={inputClass} />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
            Note
            <input name="note" placeholder="Optional" className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            Record payment sent
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Log spend</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          What the money was used for — e.g. $50 ads, $20 boosts. Balance updates automatically.
        </p>
        <form
          ref={expenseFormRef}
          action={(fd) =>
            startTransition(async () => {
              await createMarketingExpense(fd)
              expenseFormRef.current?.reset()
            })
          }
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          {projectField}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Spent on
            <input type="date" name="spent_on" required defaultValue={today} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Amount
            <input type="number" name="amount" min={0} step="0.01" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Currency
            <select name="currency" defaultValue="USD" className={inputClass}>
              <option value="USD">USD ($)</option>
              <option value="SAR">SAR (﷼)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Used for
            <input name="label" required placeholder="Instagram ads" className={inputClass} />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
            Note
            <input name="note" placeholder="Optional" className={inputClass} />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
          >
            Add spend
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Request money</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask for a total by a date. Add one or more reasons with amounts.
        </p>
        <form
          ref={requestFormRef}
          action={(fd) =>
            startTransition(async () => {
              await createMarketingRequest(fd)
              requestFormRef.current?.reset()
              setReasonRows(1)
            })
          }
          className="mt-3 flex flex-col gap-2"
        >
          {projectField}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Needed by
              <input type="date" name="needed_by" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Currency
              <select name="currency" defaultValue="USD" className={inputClass}>
                <option value="USD">USD ($)</option>
                <option value="SAR">SAR (﷼)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Title
              <input name="title" placeholder="September ads" className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Note
            <input name="note" placeholder="Optional context…" className={inputClass} />
          </label>
          {Array.from({ length: reasonRows }, (_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_140px]">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Reason {i + 1}
                <input name={`reason_${i}`} required={i === 0} placeholder="Boosts / creatives / …" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Amount
                <input type="number" name={`amount_${i}`} min={0} step="0.01" required={i === 0} className={inputClass} />
              </label>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReasonRows((n) => Math.min(10, n + 1))}
              className="h-9 rounded-lg border border-border px-3 text-sm"
            >
              Add another reason
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Send request
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Payments sent</h3>
          <ul className="mt-3 divide-y divide-border">
            {transfers.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">None yet.</li>
            ) : (
              transfers.map((t) => (
                <li key={t.id} className="py-3">
                  {editingTransfer === t.id ? (
                    <form
                      action={(fd) =>
                        startTransition(async () => {
                          await updateMarketingTransfer(t.id, fd)
                          setEditingTransfer(null)
                        })
                      }
                      className="grid gap-2"
                    >
                      <input type="date" name="sent_on" defaultValue={t.sent_on} className={inputClass} />
                      <input type="number" name="amount" step="0.01" defaultValue={t.amount} className={inputClass} />
                      <select name="currency" defaultValue={t.currency} className={inputClass}>
                        <option value="USD">USD</option>
                        <option value="SAR">SAR</option>
                      </select>
                      <input name="label" defaultValue={t.label ?? ''} className={inputClass} />
                      <input name="note" defaultValue={t.note ?? ''} className={inputClass} />
                      <div className="flex gap-2">
                        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingTransfer(null)} className="h-9 rounded-lg border px-3 text-sm">
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {formatMoney(t.amount, t.currency)} · {formatDate(t.sent_on)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.label || 'Payment'}
                          {t.note ? ` · ${t.note}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditingTransfer(t.id)} className="text-xs underline">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete this payment?'))
                              startTransition(() => deleteMarketingTransfer(t.id))
                          }}
                          className="text-xs text-destructive underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Spend log</h3>
          <ul className="mt-3 divide-y divide-border">
            {expenses.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">None yet.</li>
            ) : (
              expenses.map((e) => (
                <li key={e.id} className="py-3">
                  {editingExpense === e.id ? (
                    <form
                      action={(fd) =>
                        startTransition(async () => {
                          await updateMarketingExpense(e.id, fd)
                          setEditingExpense(null)
                        })
                      }
                      className="grid gap-2"
                    >
                      <input type="date" name="spent_on" defaultValue={e.spent_on} className={inputClass} />
                      <input type="number" name="amount" step="0.01" defaultValue={e.amount} className={inputClass} />
                      <select name="currency" defaultValue={e.currency} className={inputClass}>
                        <option value="USD">USD</option>
                        <option value="SAR">SAR</option>
                      </select>
                      <input name="label" defaultValue={e.label} className={inputClass} />
                      <input name="note" defaultValue={e.note ?? ''} className={inputClass} />
                      <div className="flex gap-2">
                        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingExpense(null)} className="h-9 rounded-lg border px-3 text-sm">
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {formatMoney(e.amount, e.currency)} · {formatDate(e.spent_on)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.label}
                          {e.note ? ` · ${e.note}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditingExpense(e.id)} className="text-xs underline">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete this spend?'))
                              startTransition(() => deleteMarketingExpense(e.id))
                          }}
                          className="text-xs text-destructive underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {pastRequests.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Past requests</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {pastRequests.map((r) => (
              <li key={r.id}>
                {r.status} · {r.title || `#${r.id}`} · {formatMoney(r.total_amount, r.currency)}
                {r.needed_by ? ` · by ${formatDate(r.needed_by)}` : ''}
                {r.note ? ` · ${r.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
