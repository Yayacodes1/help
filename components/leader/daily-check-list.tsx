import Link from 'next/link'
import { CheckForm } from '@/components/leader/check-form'
import type { LeaderRosterPerson } from '@/lib/leader-score'
import type { AttendanceStatus } from '@/lib/attendance-types'

function statusClass(status: AttendanceStatus): string {
  if (status === 'hit') return 'bg-primary/15 text-primary'
  if (status === 'late') return 'bg-orange-500/15 text-orange-800 dark:text-orange-200'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  if (status === 'miss') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

export function DailyCheckList({
  people,
  day,
  emptyLabel,
  switchHref,
  switchLabel,
  hint,
  labels,
}: {
  people: LeaderRosterPerson[]
  day: string
  emptyLabel: string
  switchHref?: string
  switchLabel?: string
  hint: string
  labels: {
    mark: string
    undo: string
    save: string
    notePh: string
    posted: string
    partial: string
    missed: string
    onBreak: string
    off: string
    creatorRole: string
    reposterRole: string
  }
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{hint}</p>
        {switchHref && switchLabel ? (
          <Link
            href={switchHref}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent"
          >
            {switchLabel}
          </Link>
        ) : null}
      </div>
      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <CheckForm
                creatorId={person.id}
                day={day}
                checked={person.checked}
                note={person.note}
                markLabel={labels.mark}
                undoLabel={labels.undo}
                saveLabel={labels.save}
                notePlaceholder={labels.notePh}
                compact
              />
              <Link
                href={`/leader/creators/${person.id}`}
                className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
              >
                {person.name}
                <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {person.role === 'reposter' ? labels.reposterRole : labels.creatorRole}
                </span>
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(person.status)}`}>
                {person.status === 'hit'
                  ? labels.posted
                  : person.status === 'late'
                    ? 'Late'
                    : person.status === 'partial'
                    ? labels.partial
                    : person.status === 'break'
                      ? labels.onBreak
                      : person.status === 'off'
                        ? labels.off
                        : labels.missed}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                IG {person.todayInstagram}/{person.goalInstagram} · TT {person.todayTiktok}/{person.goalTiktok}
              </span>
              {person.note ? (
                <p className="w-full text-xs text-muted-foreground">“{person.note}”</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
