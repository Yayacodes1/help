'use client'

import { useTransition } from 'react'
import type { ContractCompareRow } from '@/lib/queries'
import {
  createContract,
  deleteContract,
  startNewContract,
  updateContract,
} from '@/app/actions/admin'
import { formatDate } from '@/lib/format'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function HitBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.round(rate * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

export function ContractsManager({
  creatorId,
  today,
  comparisons,
}: {
  creatorId: number
  today: string
  comparisons: ContractCompareRow[]
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-4">
      {comparisons.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Compare contracts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Hit rate for each named period — newer contracts appear first.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {comparisons.map(({ contract, consistency, videoCount, isActive }) => (
              <div key={contract.id} className="flex flex-col gap-1.5">
                <HitBar
                  rate={consistency.hitRate}
                  label={`${contract.name}${isActive ? ' · current' : ''}`}
                />
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(contract.start_date)}
                  {' → '}
                  {contract.end_date ? formatDate(contract.end_date) : 'open'}
                  {' · '}
                  {consistency.hitDays}/{consistency.requiredDays} days hit
                  {' · '}
                  {videoCount} videos
                  {' · '}
                  streak {consistency.currentStreak} (best {consistency.bestStreak})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Start new contract</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Closes the open contract the day before your start date, then opens a new bar.
        </p>
        <form
          action={(fd) => startTransition(() => startNewContract(creatorId, fd))}
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
        >
          <input
            name="name"
            required
            placeholder="Name (e.g. August round)"
            className={inputClass}
          />
          <input type="date" name="start_date" required defaultValue={today} className={inputClass} />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Start
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">All contracts</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Edit name, first day, and last day. Leave end empty for an open contract.
        </p>

        {comparisons.length === 0 ? (
          <form
            action={(fd) => startTransition(() => createContract(creatorId, fd))}
            className="mt-3 grid gap-2"
          >
            <p className="text-sm text-muted-foreground">No contracts yet — add the first one.</p>
            <input
              name="name"
              required
              defaultValue="Initial contract"
              placeholder="Name"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                First day
                <input type="date" name="start_date" required defaultValue={today} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Last day (optional)
                <input type="date" name="end_date" className={inputClass} />
              </label>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Add contract
            </button>
          </form>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {comparisons.map(({ contract, isActive }) => (
              <li key={contract.id} className="py-3">
                <form
                  action={(fd) =>
                    startTransition(() => updateContract(contract.id, creatorId, fd))
                  }
                  className="grid gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      name="name"
                      required
                      defaultValue={contract.name}
                      className={`${inputClass} min-w-40 flex-1`}
                    />
                    {isActive && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                        current
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      First day
                      <input
                        type="date"
                        name="start_date"
                        required
                        defaultValue={contract.start_date}
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Last day
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={contract.end_date ?? ''}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Delete contract “${contract.name}”?`)) {
                          startTransition(() => deleteContract(contract.id, creatorId))
                        }
                      }}
                      className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-destructive"
                    >
                      Delete
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}

        {comparisons.length > 0 && (
          <form
            action={(fd) => startTransition(() => createContract(creatorId, fd))}
            className="mt-4 border-t border-border pt-4"
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Add another period (without closing the current one)
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <input name="name" required placeholder="Name" className={inputClass} />
              <input type="date" name="start_date" required className={inputClass} />
              <input type="date" name="end_date" className={inputClass} title="End (optional)" />
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
