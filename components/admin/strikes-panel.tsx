'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { addStrike, removeLatestStrike } from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { formatDate } from '@/lib/format'
import { CORRECTIVE_STRIKE_COUNT } from '@/lib/operational-day'
import type { StrikeBoard } from '@/lib/strikes'

export function StrikesPanel({
  board,
  labels,
}: {
  board: StrikeBoard
  labels: {
    hint: string
    missingToday: string
    thisContract: string
    corrective: string
    person: string
    strikes: string
    today: string
    posted: string
    missed: string
    lastStrike: string
    add: string
    take: string
    empty: string
    noContract: string
    correctiveFlag: string
  }
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xl font-semibold tabular-nums">{board.missingToday}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.missingToday}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xl font-semibold tabular-nums">{board.withContractStrikes}</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.thisContract}
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="text-xl font-semibold tabular-nums text-[#9a0d18]">
            {board.needsCorrective}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.corrective}
          </div>
        </div>
      </div>

      {board.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{labels.person}</th>
                <th className="px-3 py-2 font-medium">{labels.today}</th>
                <th className="px-3 py-2 font-medium">{labels.strikes}</th>
                <th className="px-3 py-2 font-medium">{labels.lastStrike}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr
                  key={row.creatorId}
                  className={`border-b border-border last:border-0 ${
                    row.needsCorrective ? 'bg-rose-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={adminPersonHref(row.creatorId, {
                        role: 'reposter',
                        panel: 'strikes',
                        from: 'strikes',
                      })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.contractName ?? labels.noContract}
                    </p>
                    {row.needsCorrective ? (
                      <p className="mt-0.5 text-xs font-medium text-[#9a0d18]">
                        {labels.correctiveFlag} ({CORRECTIVE_STRIKE_COUNT}+)
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.postedToday ? (
                      <span className="font-medium text-emerald-700">{labels.posted}</span>
                    ) : row.missedToday ? (
                      <span className="font-medium text-rose-700">{labels.missed}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{row.contractStrikes}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                    {row.lastStrikeDate ? formatDate(row.lastStrikeDate) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <form
                        action={(fd) => startTransition(() => addStrike(row.creatorId, fd))}
                      >
                        <input type="hidden" name="strike_date" value={board.lastCompleted} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="h-8 rounded-lg border border-border px-2 text-xs font-medium hover:bg-accent disabled:opacity-60"
                        >
                          {labels.add}
                        </button>
                      </form>
                      <button
                        type="button"
                        disabled={pending || row.contractStrikes === 0}
                        onClick={() =>
                          startTransition(() => removeLatestStrike(row.creatorId))
                        }
                        className="h-8 rounded-lg border border-border px-2 text-xs font-medium hover:bg-accent disabled:opacity-60"
                      >
                        {labels.take}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
