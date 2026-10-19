'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { PaymentDueRow } from '@/lib/queries'
import { formatDate, formatMoney } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'
import { recordDueHalfPayment } from '@/app/actions/admin'

type WaveFilter = 'first' | 'second' | 'both'

function PayButton({
  creatorId,
  contractId,
  which,
  amount,
  currency,
  label,
  pending,
  startTransition,
}: {
  creatorId: number
  contractId: number | null
  which: 'first' | 'second' | 'both'
  amount: number
  currency: 'USD' | 'SAR'
  label: string
  pending: boolean
  startTransition: (fn: () => void) => void
}) {
  if (contractId == null || amount <= 0.009) return null
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void recordDueHalfPayment(creatorId, contractId, which)
        })
      }
      className="h-8 shrink-0 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
    >
      {label} {formatMoney(amount, currency)}
    </button>
  )
}

function PaidBadge({ paid, yes, no }: { paid: boolean; yes: string; no: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        paid
          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
      }`}
    >
      {paid ? yes : no}
    </span>
  )
}

function DueTable({
  rows,
  labels,
  settled,
  linkRole,
  projectId,
  wave,
  pending,
  startTransition,
}: {
  rows: PaymentDueRow[]
  settled?: boolean
  linkRole?: string | null
  projectId?: number | string | null
  wave: WaveFilter
  pending: boolean
  startTransition: (fn: () => void) => void
  labels: {
    empty: string
    due: string
    creator: string
    contract: string
    base: string
    commission: string
    commissionMissing: string
    paid: string
    balance: string
    videos: string
    complete: string
    reasonVideosComplete: string
    reasonSchedule: string
    firstPayment: string
    secondPayment: string
    payFirst: string
    paySecond: string
    payBoth: string
    paidYes: string
    paidNo: string
  }
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {labels.empty}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">{labels.due}</th>
            <th className="px-4 py-3 font-medium">{labels.creator}</th>
            <th className="px-4 py-3 font-medium">{labels.contract}</th>
            {(wave === 'first' || wave === 'both') && (
              <th className="px-4 py-3 text-right font-medium">{labels.firstPayment}</th>
            )}
            {(wave === 'second' || wave === 'both') && (
              <th className="px-4 py-3 text-right font-medium">{labels.secondPayment}</th>
            )}
            <th className="px-4 py-3 text-right font-medium">{labels.paid}</th>
            {!settled && (
              <th className="px-4 py-3 text-right font-medium">{labels.balance}</th>
            )}
            <th className="px-4 py-3 font-medium">{labels.videos}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const firstSettled = row.firstSettled ?? row.settled
            const secondSettled = row.secondSettled ?? true
            const firstBalance = row.firstBalance ?? row.balance
            const secondBalance = row.secondBalance ?? 0
            return (
              <tr
                key={`${settled ? 's' : 'd'}-${row.creatorId}-${row.contractId ?? 'none'}-${row.reason}-${row.dueDate}-${wave}`}
                className="border-b border-border last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="font-medium tabular-nums">{formatDate(row.dueDate)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.daysOnContract != null
                      ? `${row.daysOnContract}/${row.windowDays ?? 15}`
                      : row.reason === 'videos_complete'
                        ? labels.reasonVideosComplete
                        : labels.reasonSchedule}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={adminPersonHref(row.creatorId, {
                        role: linkRole,
                        projectId,
                        panel: 'contracts',
                        from: 'paydue',
                      })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.creatorName}
                    </Link>
                    {!settled && wave === 'first' ? (
                      <PayButton
                        creatorId={row.creatorId}
                        contractId={row.contractId}
                        which="first"
                        amount={firstBalance}
                        currency={row.currency}
                        label={labels.payFirst}
                        pending={pending}
                        startTransition={startTransition}
                      />
                    ) : null}
                    {!settled && wave === 'second' && row.hasTwoHalves ? (
                      <PayButton
                        creatorId={row.creatorId}
                        contractId={row.contractId}
                        which="second"
                        amount={secondBalance}
                        currency={row.currency}
                        label={labels.paySecond}
                        pending={pending}
                        startTransition={startTransition}
                      />
                    ) : null}
                    {!settled && wave === 'both' ? (
                      <>
                        <PayButton
                          creatorId={row.creatorId}
                          contractId={row.contractId}
                          which="first"
                          amount={firstBalance}
                          currency={row.currency}
                          label={labels.payFirst}
                          pending={pending}
                          startTransition={startTransition}
                        />
                        {row.hasTwoHalves ? (
                          <PayButton
                            creatorId={row.creatorId}
                            contractId={row.contractId}
                            which="second"
                            amount={secondBalance}
                            currency={row.currency}
                            label={labels.paySecond}
                            pending={pending}
                            startTransition={startTransition}
                          />
                        ) : null}
                        {firstBalance > 0.009 && secondBalance > 0.009 ? (
                          <PayButton
                            creatorId={row.creatorId}
                            contractId={row.contractId}
                            which="both"
                            amount={firstBalance + secondBalance}
                            currency={row.currency}
                            label={labels.payBoth}
                            pending={pending}
                            startTransition={startTransition}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.contractName ?? '—'}
                </td>
                {(wave === 'first' || wave === 'both') && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="tabular-nums">
                      {formatMoney(row.firstPaid ?? row.paidAmount, row.currency)}
                      {(row.firstDue ?? 0) > 0
                        ? ` / ${formatMoney(row.firstDue ?? 0, row.currency)}`
                        : ''}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <PaidBadge paid={firstSettled} yes={labels.paidYes} no={labels.paidNo} />
                    </div>
                  </td>
                )}
                {(wave === 'second' || wave === 'both') && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.hasTwoHalves ? (
                      <>
                        <div className="tabular-nums">
                          {formatMoney(row.secondPaid ?? 0, row.currency)}
                          {(row.secondDue ?? 0) > 0
                            ? ` / ${formatMoney(row.secondDue ?? 0, row.currency)}`
                            : ''}
                        </div>
                        <div className="mt-1 flex justify-end">
                          <PaidBadge
                            paid={secondSettled}
                            yes={labels.paidYes}
                            no={labels.paidNo}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                  {formatMoney(row.paidAmount, row.currency)}
                </td>
                {!settled && (
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                    {formatMoney(row.balance, row.currency)}
                    {row.commissionMissing ? (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        + ?
                      </div>
                    ) : null}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {row.targetTotal > 0
                    ? `${row.videoCount}/${row.targetTotal}`
                    : `${row.videoCount}`}
                  {row.videosComplete ? (
                    <span className="ml-1 text-foreground">· {labels.complete}</span>
                  ) : row.videoRate != null ? (
                    <span className="ml-1">· {Math.round(row.videoRate * 100)}%</span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentDuePanel({
  due,
  settled,
  willPay = [],
  urgent = [],
  second = [],
  labels,
  linkRole,
  projectId,
}: {
  due: PaymentDueRow[]
  settled: PaymentDueRow[]
  willPay?: PaymentDueRow[]
  urgent?: PaymentDueRow[]
  second?: PaymentDueRow[]
  linkRole?: string | null
  projectId?: number | string | null
  labels: {
    empty: string
    settledEmpty: string
    settledTitle: string
    willTitle: string
    willEmpty: string
    urgentTitle: string
    urgentEmpty: string
    urgentHint: string
    daysOn: string
    due: string
    creator: string
    contract: string
    base: string
    commission: string
    commissionMissing: string
    paid: string
    balance: string
    videos: string
    complete: string
    reasonVideosComplete: string
    reasonSchedule: string
    openCreator: string
    firstPayment: string
    secondPayment: string
    bothPayments: string
    payFirst: string
    paySecond: string
    payBoth: string
    paidYes: string
    paidNo: string
  }
}) {
  const [wave, setWave] = useState<WaveFilter>('first')
  const [pending, startTransition] = useTransition()
  const tableLabels = {
    empty: labels.empty,
    due: labels.due,
    creator: labels.creator,
    contract: labels.contract,
    base: labels.base,
    commission: labels.commission,
    commissionMissing: labels.commissionMissing,
    paid: labels.paid,
    balance: labels.balance,
    videos: labels.videos,
    complete: labels.complete,
    reasonVideosComplete: labels.reasonVideosComplete,
    reasonSchedule: labels.reasonSchedule,
    firstPayment: labels.firstPayment,
    secondPayment: labels.secondPayment,
    payFirst: labels.payFirst,
    paySecond: labels.paySecond,
    payBoth: labels.payBoth,
    paidYes: labels.paidYes,
    paidNo: labels.paidNo,
  }
  const filters: Array<{ id: WaveFilter; label: string }> = [
    { id: 'first', label: labels.firstPayment },
    { id: 'second', label: labels.secondPayment },
    { id: 'both', label: labels.bothPayments },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setWave(f.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              wave === f.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels.urgentHint}</p>
      {wave === 'first' || wave === 'both' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            {labels.urgentTitle}
          </h3>
          <DueTable
            rows={urgent}
            wave={wave}
            pending={pending}
            startTransition={startTransition}
            linkRole={linkRole}
            projectId={projectId}
            labels={{ ...tableLabels, empty: labels.urgentEmpty }}
          />
        </div>
      ) : null}
      {wave === 'first' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{labels.willTitle}</h3>
          <DueTable
            rows={willPay}
            wave={wave}
            pending={pending}
            startTransition={startTransition}
            linkRole={linkRole}
            projectId={projectId}
            labels={{ ...tableLabels, empty: labels.willEmpty }}
          />
        </div>
      ) : null}
      {wave === 'second' ? (
        <DueTable
          rows={second}
          wave={wave}
          pending={pending}
          startTransition={startTransition}
          linkRole={linkRole}
          projectId={projectId}
          labels={{ ...tableLabels, empty: labels.empty }}
        />
      ) : null}
      {wave === 'both' ? (
        <DueTable
          rows={second.length > 0 ? second : [...urgent, ...willPay, ...due]}
          wave={wave}
          pending={pending}
          startTransition={startTransition}
          linkRole={linkRole}
          projectId={projectId}
          labels={tableLabels}
        />
      ) : null}
      {wave === 'first' ? (
        <DueTable
          rows={due}
          wave={wave}
          pending={pending}
          startTransition={startTransition}
          labels={tableLabels}
          linkRole={linkRole}
          projectId={projectId}
        />
      ) : null}
      <div>
        <h3 className="mb-2 text-sm font-semibold">{labels.settledTitle}</h3>
        <DueTable
          rows={settled}
          settled
          wave={wave}
          pending={pending}
          startTransition={startTransition}
          linkRole={linkRole}
          projectId={projectId}
          labels={{ ...tableLabels, empty: labels.settledEmpty }}
        />
      </div>
    </div>
  )
}
