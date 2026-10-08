'use client'

import { useState } from 'react'
import { formatPlanCompare, planDelta, type LeaderBoard, type LeaderScore } from '@/lib/leaders'
import type { AttendanceStatus } from '@/lib/attendance-types'

function Delta({ today, yesterday }: { today: number | null; yesterday: number | null }) {
  const delta = planDelta(today, yesterday)
  if (delta == null) return <span className="text-muted-foreground">–</span>
  if (delta > 0) return <span className="font-semibold text-emerald-700 dark:text-emerald-300">▲{delta}</span>
  if (delta < 0) return <span className="font-semibold text-destructive">▼{-delta}</span>
  return <span className="text-muted-foreground">=</span>
}

function statusWord(status: AttendanceStatus): string {
  if (status === 'hit') return 'Posted'
  if (status === 'partial') return 'Partial'
  if (status === 'break') return 'Break'
  if (status === 'off') return 'Off'
  return "Didn't post"
}

function Row({
  rank,
  row,
  open,
  onToggle,
}: {
  rank: string
  row: LeaderScore
  open: boolean
  onToggle: () => void
}) {
  const reposter =
    row.reposterName == null
      ? '—'
      : `${row.reposterName}${
          row.reposterStatus === 'hit' ? ' · posted' : row.reposterStatus ? ' · not on plan' : ''
        }`
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-3 py-2 text-muted-foreground">{rank}</td>
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} className="font-medium underline-offset-4 hover:underline">
            {row.name}
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{row.todayPct ?? '–'}%</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.yesterdayPct ?? '–'}%</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <Delta today={row.todayPct} yesterday={row.yesterdayPct} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {row.today.posted}/{row.today.partial}/{row.today.missed}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {row.checks}/{row.roster}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{row.atRisk}</td>
        <td className="px-3 py-2 text-muted-foreground">{reposter}</td>
      </tr>
      {open ? (
        <tr className="border-b border-border bg-muted/40">
          <td colSpan={9} className="px-3 py-3">
            {row.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No creators assigned.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {row.people.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{person.name}</span>
                    <span>{statusWord(person.status)}</span>
                    <span className="text-muted-foreground">
                      IG {person.todayInstagram}/{person.goalInstagram} · TT {person.todayTiktok}/{person.goalTiktok}
                    </span>
                    <span className="text-muted-foreground">
                      yesterday {person.yesterdayStatus ? statusWord(person.yesterdayStatus) : '—'}
                    </span>
                    <span>{person.checked ? 'Checked' : 'Not checked'}</span>
                    {person.note ? <span className="text-muted-foreground">“{person.note}”</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function LeadersBoard({ board }: { board: LeaderBoard }) {
  const [openId, setOpenId] = useState<number | 'none' | null>(null)
  const allLine = formatPlanCompare(board.all.todayPct, board.all.yesterdayPct, 'today', 'yesterday')

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        All creators on plan: <span className="font-semibold tabular-nums">{allLine}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Ranked best to worst by today’s on-plan rate. Posted / partial / didn’t, then checks done, then creators near a
        strike. {board.day} vs {board.prevDay}.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Leader</th>
              <th className="px-3 py-2 text-right font-medium">Today</th>
              <th className="px-3 py-2 text-right font-medium">Yesterday</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
              <th className="px-3 py-2 text-right font-medium">P / part / miss</th>
              <th className="px-3 py-2 text-right font-medium">Checked</th>
              <th className="px-3 py-2 text-right font-medium">At risk</th>
              <th className="px-3 py-2 font-medium">Reposter</th>
            </tr>
          </thead>
          <tbody>
            {board.leaders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-sm text-muted-foreground">
                  No leaders yet. Add one below and assign their creators.
                </td>
              </tr>
            ) : (
              board.leaders.map((row, index) => (
                <Row
                  key={row.leaderId}
                  rank={String(index + 1)}
                  row={row}
                  open={openId === row.leaderId}
                  onToggle={() => setOpenId((current) => (current === row.leaderId ? null : row.leaderId))}
                />
              ))
            )}
            {board.unassigned ? (
              <Row
                rank="—"
                row={board.unassigned}
                open={openId === 'none'}
                onToggle={() => setOpenId((current) => (current === 'none' ? null : 'none'))}
              />
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
