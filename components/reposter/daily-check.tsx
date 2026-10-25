import { ActivityToggles } from '@/components/activity-toggles'
import { CheckForm } from '@/components/leader/check-form'
import { saveReposterCheck } from '@/app/actions/reposter-check'
import { REPOSTER_ACTIVITY_KINDS, type ActivityKind } from '@/lib/activity-kinds'
import type { AttendanceStatus } from '@/lib/attendance-types'

function statusClass(status: AttendanceStatus): string {
  if (status === 'hit') return 'bg-primary/15 text-primary'
  if (status === 'late') return 'bg-orange-500/15 text-orange-800 dark:text-orange-200'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  if (status === 'miss') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

export type ReposterCheckPerson = {
  id: number
  handle: string
  status: AttendanceStatus
  todayInstagram: number
  todayTiktok: number
  goalInstagram: number
  goalTiktok: number
  checked: boolean
}

export function ReposterDailyCheck({
  people,
  day,
  marks,
  actorUsername,
  labels,
}: {
  people: ReposterCheckPerson[]
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
    mark: string
    undo: string
    comment: string
    like: string
    save: string
  }
}) {
  function word(status: AttendanceStatus) {
    if (status === 'hit') return labels.posted
    if (status === 'late') return 'Late'
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <CheckForm
                creatorId={person.id}
                day={day}
                checked={person.checked}
                note={null}
                markLabel={labels.mark}
                undoLabel={labels.undo}
                saveLabel={labels.mark}
                notePlaceholder=""
                compact
                action={saveReposterCheck}
                extraFields={{ username: actorUsername }}
              />
              <span className="min-w-0 flex-1 font-medium">@{person.handle}</span>
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
              kinds={REPOSTER_ACTIVITY_KINDS}
              labels={{
                comments: labels.comment,
                like: labels.like,
                save: labels.save,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
