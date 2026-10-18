import { ActivityToggles } from '@/components/activity-toggles'
import type { ActivityKind } from '@/lib/activity-kinds'
import type { AttendanceStatus } from '@/lib/attendance-types'
import type { LeaderRosterPerson } from '@/lib/leader-score'

function statusClass(status: AttendanceStatus): string {
  if (status === 'hit') return 'bg-primary/15 text-primary'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  if (status === 'miss') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

export function ReposterDailyCheck({
  people,
  day,
  marks,
  actorUsername,
  labels,
}: {
  people: LeaderRosterPerson[]
  day: string
  marks: Record<number, ActivityKind[]>
  actorUsername: string
  labels: {
    hint: string
    empty: string
    posted: string
    partial: string
    missed: string
    break: string
    off: string
    creator: string
    reposter: string
  }
}) {
  function word(status: AttendanceStatus) {
    if (status === 'hit') return labels.posted
    if (status === 'partial') return labels.partial
    if (status === 'break') return labels.break
    if (status === 'off') return labels.off
    return labels.missed
  }

  if (people.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {labels.empty}
      </p>
    )
  }

  const creators = people.filter((p) => p.role === 'creator')
  const reposters = people.filter((p) => p.role === 'reposter')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      {creators.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {creators.map((person) => (
            <li
              key={person.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{person.name}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.creator}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(person.status)}`}>
                  {word(person.status)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  IG {person.todayInstagram}/{person.goalInstagram} · TT {person.todayTiktok}/
                  {person.goalTiktok}
                </span>
              </div>
              <ActivityToggles
                creatorId={person.id}
                day={day}
                marked={marks[person.id] ?? []}
                actorUsername={actorUsername}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {reposters.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {reposters.map((person) => (
            <li
              key={person.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{person.name}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {labels.reposter}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(person.status)}`}>
                  {word(person.status)}
                </span>
              </div>
              <ActivityToggles
                creatorId={person.id}
                day={day}
                marked={marks[person.id] ?? []}
                actorUsername={actorUsername}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
