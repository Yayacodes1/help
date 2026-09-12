import Link from 'next/link'
import type { PaymentDueRow } from '@/lib/queries'
import { formatDate, formatMoney } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'

function DueTable({
  rows,
  labels,
  settled,
  linkRole,
  projectId,
}: {
  rows: PaymentDueRow[]
  settled?: boolean
  linkRole?: string | null
  projectId?: number | string | null
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
            <th className="px-4 py-3 text-right font-medium">{labels.base}</th>
            <th className="px-4 py-3 text-right font-medium">{labels.commission}</th>
            <th className="px-4 py-3 text-right font-medium">{labels.paid}</th>
            {!settled && (
              <th className="px-4 py-3 text-right font-medium">{labels.balance}</th>
            )}
            <th className="px-4 py-3 font-medium">{labels.videos}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${settled ? 's' : 'd'}-${row.creatorId}-${row.contractId ?? 'none'}-${row.reason}-${row.dueDate}`}
              className="border-b border-border last:border-0"
            >
              <td className="whitespace-nowrap px-4 py-3">
                <div className="font-medium tabular-nums">{formatDate(row.dueDate)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {row.reason === 'videos_complete'
                    ? labels.reasonVideosComplete
                    : labels.reasonSchedule}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
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
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.contractName ?? '—'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatMoney(row.baseAmount)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {row.commissionMissing ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    {labels.commissionMissing}
                  </span>
                ) : (
                  formatMoney(row.commissionAmount ?? 0)
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                {formatMoney(row.paidAmount)}
              </td>
              {!settled && (
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                  {formatMoney(row.balance)}
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
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PaymentDuePanel({
  due,
  settled,
  labels,
  linkRole,
  projectId,
}: {
  due: PaymentDueRow[]
  settled: PaymentDueRow[]
  linkRole?: string | null
  projectId?: number | string | null
  labels: {
    empty: string
    settledEmpty: string
    settledTitle: string
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
  }
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Pay due when a contract hits its video target (counted from start). End date does not matter.
        Open the creator → Contracts to record payment.
      </p>
      <DueTable rows={due} labels={labels} linkRole={linkRole} projectId={projectId} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">{labels.settledTitle}</h3>
        <DueTable
          rows={settled}
          settled
          linkRole={linkRole}
          projectId={projectId}
          labels={{ ...labels, empty: labels.settledEmpty }}
        />
      </div>
    </div>
  )
}
