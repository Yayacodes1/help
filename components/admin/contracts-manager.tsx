'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ContractCompareRow } from '@/lib/queries'
import type { PlatformsMode } from '@/lib/platforms-mode'
import {
  createContract,
  deleteContract,
  recordContractPayment,
  recordPastContractsAsPaid,
  startNewContract,
  updateContract,
} from '@/app/actions/admin'
import { formatDate, formatMoney } from '@/lib/format'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function TapOpenSection({
  title,
  summary,
  hint,
  children,
}: {
  title: string
  summary: string
  hint?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-start justify-between gap-3 p-4 text-left transition-colors ${
          open ? 'border-b border-border' : 'hover:bg-accent/30'
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="mt-1 text-sm tabular-nums text-foreground">{summary}</div>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? <div className="p-4 pt-3">{children}</div> : null}
    </div>
  )
}

function PlatformsField({ value = 'both' }: { value?: PlatformsMode | string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Platforms
      <select name="platforms" defaultValue={value || 'both'} className={inputClass}>
        <option value="both">Instagram + TikTok</option>
        <option value="tiktok">TikTok only</option>
        <option value="instagram">Instagram only</option>
      </select>
    </label>
  )
}

function QuotaFields({
  goalIg = 0,
  goalTt = 0,
  targetIg = 0,
  targetTt = 0,
  variant = 'current',
}: {
  goalIg?: number
  goalTt?: number
  targetIg?: number
  targetTt?: number
  variant?: 'current' | 'past'
}) {
  const totalLabel = variant === 'past' ? 'hit (final)' : 'goal (aiming for)'
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        IG / day
        <input type="number" min={0} name="goal_instagram" defaultValue={goalIg} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        TT / day
        <input type="number" min={0} name="goal_tiktok" defaultValue={goalTt} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        IG {totalLabel}
        <input type="number" min={0} name="target_instagram" defaultValue={targetIg} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        TT {totalLabel}
        <input type="number" min={0} name="target_tiktok" defaultValue={targetTt} className={inputClass} />
      </label>
    </div>
  )
}

function PayFields({
  base = 0,
  commission,
  requireBase = false,
  variant = 'current',
}: {
  base?: number
  commission?: number | null
  requireBase?: boolean
  variant?: 'current' | 'past'
}) {
  const isPast = variant === 'past'
  return (
    <div className="grid gap-2">
      <p className="text-[11px] text-muted-foreground">
        {isPast
          ? 'Past contract: amounts here are what you already gave her. Saving records them as paid.'
          : 'Current contract: base/commission are the deal terms. Saving keeps them as terms — use Mark paid anytime (even mid-contract or upfront) to add to Total paid.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {isPast ? 'Base I paid' : 'Base pay (terms)'}
          <input
            type="number"
            min={0}
            step="0.01"
            name="base_amount"
            defaultValue={base || ''}
            required={requireBase}
            placeholder="0.00"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {isPast ? 'Commission I paid' : 'Commission (terms)'}
          <span className="font-normal">{isPast ? '(blank = none)' : '(blank keeps saved value)'}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            name="commission_amount"
            defaultValue={commission != null ? commission : ''}
            placeholder={isPast ? '0.00' : 'Add later'}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  )
}

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

function paySummaryLine(row: ContractCompareRow): string {
  const { contract, paidAmount, expectedTotal, commissionMissing, balance } = row
  const base = Number(contract.base_amount) || 0
  const parts: string[] = []
  if (base > 0) {
    parts.push(
      row.isActive && !row.isPast
        ? `terms ${formatMoney(base)}`
        : `base ${formatMoney(base)}`,
    )
  }
  if (!commissionMissing) {
    parts.push(`commission ${formatMoney(Number(contract.commission_amount))}`)
  } else if (!row.isPast) {
    parts.push('commission not put in')
  }
  if (expectedTotal != null) parts.push(`expected ${formatMoney(expectedTotal)}`)
  parts.push(`paid ${formatMoney(paidAmount)}`)
  if (balance > 0.009) {
    parts.push(`still due ${formatMoney(balance)}`)
  } else if (paidAmount > 0.009 && base > 0) {
    parts.push('settled')
  }
  return parts.join(' · ')
}

function MarkPaidButton({
  creatorId,
  today,
  row,
  pending,
  startTransition,
}: {
  creatorId: number
  today: string
  row: ContractCompareRow
  pending: boolean
  startTransition: (fn: () => void) => void
}) {
  const { contract, balance, paidAmount, isActive, isPast } = row
  if (balance <= 0.009) return null
  const mid = isActive && !isPast
  return (
    <form
      action={(fd) =>
        startTransition(() => recordContractPayment(creatorId, contract.id, fd))
      }
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3"
    >
      <p className="w-full text-[11px] text-muted-foreground">
        {mid
          ? 'Pay anytime on this running contract (upfront or mid-period). Only Mark paid updates Total paid.'
          : 'Record what you actually paid for this period. Only this updates Total paid.'}
      </p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Paid on
        <input type="date" name="paid_on" required defaultValue={today} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Amount
        <input
          type="number"
          name="amount"
          min={0}
          step="0.01"
          required
          defaultValue={balance}
          className={inputClass}
        />
      </label>
      <input
        type="hidden"
        name="note"
        value={mid ? `Paid on current · ${contract.name}` : `Settled ${contract.name}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Mark paid {formatMoney(balance)}
        {paidAmount > 0.009 ? ' (balance)' : ''}
      </button>
    </form>
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
  const stickyBase =
    comparisons.find((r) => Number(r.contract.base_amount) > 0)?.contract.base_amount ?? 0
  const current = comparisons.find((r) => r.isActive)
  // Past contracts where typed money is not yet fully in the payments list.
  const needsRecord = comparisons.filter((r) => {
    if (r.isActive && !r.isPast) return false
    const terms =
      (Number(r.contract.base_amount) || 0) +
      (r.contract.commission_amount == null ? 0 : Number(r.contract.commission_amount) || 0)
    return terms > 0.009 && r.paidAmount < terms - 0.009
  })
  const unpaidPastTotal = needsRecord.reduce((sum, r) => {
    const terms =
      (Number(r.contract.base_amount) || 0) +
      (r.contract.commission_amount == null ? 0 : Number(r.contract.commission_amount) || 0)
    return sum + Math.max(0, terms - r.paidAmount)
  }, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How money works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            <span className="text-foreground">Current</span>: base/commission = deal terms. You can{' '}
            <span className="text-foreground">Mark paid anytime</span> (upfront or while it’s running).
            TT/IG totals = goals.
          </li>
          <li>
            <span className="text-foreground">Past</span>: saving amounts records them as paid. Or use
            Mark paid / the banner below.
          </li>
          <li>Total paid only moves when a payment is recorded (Mark paid or Payments panel).</li>
        </ol>
      </div>

      {needsRecord.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {needsRecord.length} past contract{needsRecord.length === 1 ? '' : 's'} still not in Total
            paid
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Typed amounts on past contracts aren’t in Payments yet. Record{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(unpaidPastTotal)}
            </span>{' '}
            as paid — clears Pay due and fills Total paid.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => recordPastContractsAsPaid(creatorId))}
            className="mt-3 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Record past amounts as paid
          </button>
        </div>
      )}

      {comparisons.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Progress by contract</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current shows progress toward goals. Past shows what she hit. Paid amounts need Mark paid.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {comparisons.map((row) => {
              const {
                contract,
                consistency,
                videoCount,
                postedInstagram,
                postedTiktok,
                targetTotal,
                videoRate,
                displayRate,
                videosComplete,
                isPast,
                isActive,
                manualHits,
              } = row
              return (
                <div key={contract.id} className="flex flex-col gap-1.5">
                  <HitBar
                    rate={displayRate}
                    label={`${contract.name}${isActive ? ' · current' : ''}${
                      videosComplete ? ' · 100% videos' : ''
                    }`}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(contract.start_date)}
                    {' → '}
                    {contract.end_date ? formatDate(contract.end_date) : 'open'}
                    {isPast ? ' · past' : ''}
                    {' · '}
                    Instagram + TikTok
                    {' · '}
                    {manualHits
                      ? `${videoCount} videos hit`
                      : videoRate != null
                        ? `${videoCount}${targetTotal > 0 ? `/${targetTotal}` : ''} videos (${Math.round(videoRate * 100)}%)`
                        : `${consistency.hitDays}/${consistency.requiredDays} days hit · ${videoCount} videos`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    IG {postedInstagram}
                    {!manualHits && contract.target_instagram > 0
                      ? `/${contract.target_instagram} goal`
                      : manualHits
                        ? ' hit'
                        : ''}
                    {' · '}
                    TT {postedTiktok}
                    {!manualHits && contract.target_tiktok > 0
                      ? `/${contract.target_tiktok} goal`
                      : manualHits
                        ? ' hit'
                        : ''}
                    {' · '}
                    daily IG {contract.goal_instagram}/d · TT {contract.goal_tiktok}/d
                  </p>
                  <p className="text-[11px] font-medium text-foreground">{paySummaryLine(row)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <TapOpenSection
        title="Start new / current contract"
        summary="Tap to start"
        hint="Ends overlapping older periods so this one is current. Mark paid anytime after."
      >
        <form
          action={(fd) => startTransition(() => startNewContract(creatorId, fd))}
          className="grid gap-2"
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input name="name" required placeholder="Name (e.g. August round)" className={inputClass} />
            <input type="date" name="start_date" required defaultValue={today} className={inputClass} />
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Start
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PlatformsField />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Last day (optional)
              <input type="date" name="end_date" className={inputClass} />
            </label>
          </div>
          <PayFields base={Number(stickyBase) || 0} requireBase variant="current" />
          <QuotaFields variant="current" />
        </form>
      </TapOpenSection>

      <TapOpenSection
        title="All contracts"
        summary={
          comparisons.length === 0
            ? 'None yet'
            : `${comparisons.length} period${comparisons.length === 1 ? '' : 's'}`
        }
        hint={
          current
            ? `Current · ${current.contract.name}`
            : 'Edit terms and Mark paid — including the current period'
        }
      >
        {comparisons.length === 0 ? (
          <form
            action={(fd) => startTransition(() => createContract(creatorId, fd))}
            className="grid gap-2"
          >
            <p className="text-sm text-muted-foreground">No contracts yet — add the first one.</p>
            <input name="name" required defaultValue="Initial contract" className={inputClass} />
            <PlatformsField />
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
            <PayFields requireBase variant="current" />
            <QuotaFields variant="current" />
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Add contract
            </button>
          </form>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {[...(current ? [current] : []), ...comparisons.filter((r) => r !== current)].map(
              (row) => {
                const {
                  contract,
                  isActive,
                  isPast,
                  paidAmount,
                  expectedTotal,
                  commissionMissing,
                  balance,
                } = row
                const pastVariant = isPast && !isActive
                return (
                  <li key={contract.id} className="py-3 first:pt-0 last:pb-0">
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
                        {pastVariant && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                            past
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Terms {expectedTotal != null ? formatMoney(expectedTotal) : '—'}
                        {' · '}
                        Paid {formatMoney(paidAmount)}
                        {balance > 0.009
                          ? ` · still due ${formatMoney(balance)}`
                          : paidAmount > 0.009
                            ? ' · settled'
                            : ''}
                        {commissionMissing ? ' · commission not put in' : ''}
                        {isActive && !isPast ? ' · can Mark paid anytime' : ''}
                      </p>
                      <PlatformsField value={contract.platforms} />
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
                      <PayFields
                        base={Number(contract.base_amount) || 0}
                        commission={contract.commission_amount}
                        variant={pastVariant ? 'past' : 'current'}
                      />
                      <QuotaFields
                        goalIg={contract.goal_instagram}
                        goalTt={contract.goal_tiktok}
                        targetIg={contract.target_instagram}
                        targetTt={contract.target_tiktok}
                        variant={pastVariant ? 'past' : 'current'}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={pending}
                          className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          {pastVariant ? 'Save & record as paid' : 'Save terms'}
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
                    <MarkPaidButton
                      creatorId={creatorId}
                      today={today}
                      row={row}
                      pending={pending}
                      startTransition={startTransition}
                    />
                  </li>
                )
              },
            )}
          </ul>
        )}
      </TapOpenSection>
    </div>
  )
}
