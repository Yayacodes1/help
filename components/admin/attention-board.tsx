'use client'

import Link from 'next/link'
import { DayNavigator } from '@/components/admin/day-navigator'
import { adminPersonHref } from '@/lib/admin-href'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  hit: 'border-emerald-500/40 bg-emerald-500/10',
  partial: 'border-amber-500/40 bg-amber-500/10',
  miss: 'border-rose-500/40 bg-rose-500/10',
  break: 'border-sky-500/40 bg-sky-500/10',
}

const DOT_CLASS: Record<AttendanceStatus, string> = {
  hit: 'bg-emerald-500',
  partial: 'bg-amber-400',
  miss: 'bg-rose-500',
  break: 'bg-sky-400',
}

export function AttentionBoard({
  people,
  selectedDay,
  today,
  dayLabel,
  linkRole,
  projectId,
  labels,
}: {
  people: AttendancePerson[]
  selectedDay: string
  today: string
  dayLabel: string
  linkRole?: string | null
  projectId?: number | string | null
  labels: {
    legendHit: string
    legendPartial: string
    legendMiss: string
    legendBreak: string
    missing: string
    allClear: string
    strikes: string
  }
}) {
  return (
    <div className="flex flex-col gap-4">
      <DayNavigator selectedDay={selectedDay} today={today} />

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(
          [
            ['hit', labels.legendHit],
            ['partial', labels.legendPartial],
            ['miss', labels.legendMiss],
            ['break', labels.legendBreak],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${DOT_CLASS[status]}`} />
            {label}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{dayLabel}</p>

      {people.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {labels.allClear}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => {
            const missing: string[] = []
            if (p.status === 'partial') {
              if (p.goalInstagram > 0 && p.todayInstagram < p.goalInstagram) {
                missing.push(`IG ${p.todayInstagram}/${p.goalInstagram}`)
              }
              if (p.goalTiktok > 0 && p.todayTiktok < p.goalTiktok) {
                missing.push(`TT ${p.todayTiktok}/${p.goalTiktok}`)
              }
            } else if (p.status === 'miss') {
              missing.push(labels.missing)
            } else if (p.status === 'hit') {
              if (p.goalInstagram > 0) missing.push(`IG ${p.todayInstagram}/${p.goalInstagram}`)
              if (p.goalTiktok > 0) missing.push(`TT ${p.todayTiktok}/${p.goalTiktok}`)
            }

            return (
              <li
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${STATUS_CLASS[p.status]}`}
              >
                <div className="min-w-0">
                  <Link
                    href={adminPersonHref(p.id, {
                      role: linkRole ?? p.role,
                      projectId,
                      panel: 'consistency',
                      from: 'attention',
                    })}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                    {p.role}
                    {p.status === 'miss' && p.missStreak > 0 ? ` · ${p.missStreak}X` : ''}
                    {p.role === 'reposter' && p.contractStrikes > 0
                      ? ` · ${labels.strikes} ${p.contractStrikes}/${p.maxStrikes}`
                      : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs tabular-nums text-muted-foreground">
                  {missing.length > 0
                    ? missing.map((m) => <span key={m}>{m}</span>)
                    : p.status === 'break'
                      ? labels.legendBreak
                      : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
