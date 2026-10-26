'use client'

import { useTransition } from 'react'
import { approveBreakRequest, denyBreakRequest } from '@/app/actions/admin'
import type { BreakRequest } from '@/lib/break-requests'
import { formatDate } from '@/lib/format'

export function BreakRequestsBoard({
  requests,
  labels,
}: {
  requests: BreakRequest[]
  labels: {
    empty: string
    approve: string
    deny: string
    pending: string
    approved: string
    denied: string
    from: string
    kindBreak: string
    kindPause: string
    waitingGive: string
    applied: string
  }
}) {
  const [pending, startTransition] = useTransition()
  const open = requests.filter((r) => r.status === 'pending')
  const rest = requests.filter((r) => r.status !== 'pending')

  function Row({ row }: { row: BreakRequest }) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-0">
        <div>
          <p className="text-sm font-medium">
            {row.creator_name}
            <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {row.kind === 'pause' ? labels.kindPause : labels.kindBreak}
              {' · '}
              {row.creator_role}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {labels.from} {row.leader_name}
            {row.kind === 'pause' ? '' : ` · ${formatDate(row.start_date)} → ${formatDate(row.end_date)}`}
            {row.reason ? ` · ${row.reason}` : ''}
          </p>
        </div>
        {row.status === 'pending' ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => approveBreakRequest(row.id))}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {labels.approve}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => denyBreakRequest(row.id))}
              className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              {labels.deny}
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {row.status === 'approved'
              ? row.applied_at
                ? labels.applied
                : labels.waitingGive
              : labels.denied}
          </span>
        )}
      </li>
    )
  }

  if (requests.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {labels.empty}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {open.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      ) : null}
      {rest.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {rest.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
