import Link from 'next/link'
import { ActivityToggles } from '@/components/activity-toggles'
import type { ActivityKind } from '@/lib/activity-kinds'
import type { AttendanceStatus } from '@/lib/attendance-types'
import type { LeaderBoard, LeaderRosterPerson, LeaderScore } from '@/lib/leader-score'
import { SQUAD_NAMES, squadKeyFromName, squadLabel, type SquadKey } from '@/lib/squads'

function statusClass(status: AttendanceStatus): string {
  if (status === 'hit') return 'bg-primary/15 text-primary'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  if (status === 'miss') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function statusWord(status: AttendanceStatus): string {
  if (status === 'hit') return 'Posted'
  if (status === 'partial') return 'Partial'
  if (status === 'break') return 'Break'
  if (status === 'off') return 'Off'
  return "Didn't post"
}

function PersonRow({
  person,
  day,
  marks,
}: {
  person: LeaderRosterPerson
  day: string
  marks: Record<number, ActivityKind[]>
}) {
  const isReposter = person.role === 'reposter'
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-background/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/creators/${person.id}`}
          className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
        >
          {person.name}
        </Link>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isReposter ? 'Reposter' : 'Creator'}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(person.status)}`}>
          {statusWord(person.status)}
        </span>
        {person.checked ? (
          <span className="text-[11px] font-medium text-primary">Checked</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not checked</span>
        )}
      </div>
      {!isReposter ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          IG {person.todayInstagram}/{person.goalInstagram} · TT {person.todayTiktok}/{person.goalTiktok}
        </p>
      ) : (
        <ActivityToggles creatorId={person.id} day={day} marked={marks[person.id] ?? []} />
      )}
    </li>
  )
}

function SquadCard({
  title,
  score,
  day,
  marks,
}: {
  title: string
  score: LeaderScore | null
  day: string
  marks: Record<number, ActivityKind[]>
}) {
  const creators = score?.people.filter((p) => p.role === 'creator') ?? []
  const reposters = score?.people.filter((p) => p.role === 'reposter') ?? []
  const posted = creators.filter((p) => p.status === 'hit').length
  const activitiesDone = reposters.filter((p) => (marks[p.id] ?? []).length > 0).length
  return (
    <section className="flex min-h-[18rem] flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <h3 className="text-lg font-semibold tracking-tight">{score?.name ?? 'Unassigned'}</h3>
        </div>
        {score?.leaderId != null ? (
          <Link
            href={`/admin/leaders/${score.leaderId}`}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Open
          </Link>
        ) : null}
      </header>
      {score ? (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-secondary/50 p-2">
            <dt className="text-muted-foreground">Creators on plan</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {posted}/{creators.length}
              {score.todayPct != null ? ` · ${score.todayPct}%` : ''}
            </dd>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2">
            <dt className="text-muted-foreground">Leader checks</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {score.checks}/{score.roster}
            </dd>
          </div>
          <div className="col-span-2 rounded-lg bg-secondary/50 p-2">
            <dt className="text-muted-foreground">Reposter activity today</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {activitiesDone}/{reposters.length || 0} started Live / Story / Repost / Comments
            </dd>
          </div>
        </dl>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No leader named {title} yet.
        </p>
      )}
      {creators.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Creators</h4>
          <ul className="flex flex-col gap-1.5">
            {creators.map((person) => (
              <PersonRow key={person.id} person={person} day={day} marks={marks} />
            ))}
          </ul>
        </div>
      ) : null}
      {reposters.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reposters</h4>
          <ul className="flex flex-col gap-1.5">
            {reposters.map((person) => (
              <PersonRow key={person.id} person={person} day={day} marks={marks} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function LeaderSquadsBoard({
  board,
  marks,
}: {
  board: LeaderBoard
  marks: Record<number, ActivityKind[]>
}) {
  const used = new Set<number>()
  const bySquad = new Map<SquadKey, LeaderScore | null>()
  for (const name of SQUAD_NAMES) bySquad.set(name, null)
  for (const row of board.leaders) {
    if (row.leaderId == null) continue
    const key = squadKeyFromName(row.name)
    if (key !== 'other' && bySquad.get(key) == null) {
      bySquad.set(key, row)
      used.add(row.leaderId)
    }
  }
  const extras = board.leaders.filter((row) => row.leaderId != null && !used.has(row.leaderId))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Four groups. Each card is that leader&apos;s check: whether creators posted, and whether
        reposters ticked Live / Story / Repost / Comments.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {SQUAD_NAMES.map((name) => (
          <SquadCard
            key={name}
            title={squadLabel(name)}
            score={bySquad.get(name) ?? null}
            day={board.day}
            marks={marks}
          />
        ))}
      </div>
      {extras.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {extras.map((row) => (
            <SquadCard
              key={row.leaderId ?? row.name}
              title={row.name}
              score={row}
              day={board.day}
              marks={marks}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
