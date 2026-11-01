import Link from 'next/link'
import { StatCard } from '@/components/stat-card'
import { adminPersonHref } from '@/lib/admin-href'
import type { ContractEndsModel } from '@/lib/contract-ends'
import { participantRoleLabel } from '@/lib/participant-role'

function dayLabel(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function ContractEnds({
  model,
  locale,
  labels,
}: {
  model: ContractEndsModel
  locale: string
  labels: {
    card: string
    open: string
    thisWeek: string
    nextWeek: string
    later: string
    started: string
    ends: string
    videos: string
    warningTitle: string
    warning: string
    empty: string
  }
}) {
  function groupTitle(offset: number | null): string {
    if (offset == null) return labels.warningTitle
    if (offset === 0) return labels.thisWeek
    if (offset === 1) return labels.nextWeek
    return labels.later.replace('{n}', String(offset))
  }

  return (
    <div className="flex flex-col gap-4">
      <StatCard label={labels.card} value={model.thisWeek} hint={labels.open} />
      {model.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        model.groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {groupTitle(group.offset)}
                <span className="ml-2 tabular-nums text-muted-foreground">{group.people.length}</span>
              </h3>
              {group.rangeStart && group.rangeEnd ? (
                <p className="text-xs text-muted-foreground">
                  {dayLabel(group.rangeStart, locale)} – {dayLabel(group.rangeEnd, locale)}
                </p>
              ) : null}
            </header>
            <ul className="flex flex-col gap-2">
              {group.people.map((person) => (
                <li
                  key={person.id}
                  className={`rounded-lg border bg-card px-3 py-3 ${
                    person.warning ? 'border-destructive/60' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={adminPersonHref(person.id, { role: person.role, from: 'ends' })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {person.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {participantRoleLabel(person.role)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {labels.started} {dayLabel(person.start, locale)}
                    {' · '}
                    {labels.ends} {dayLabel(person.end, locale)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums">
                    {labels.videos} {person.videos}
                    {person.target > 0 ? `/${person.target}` : ''}
                  </p>
                  {person.warning ? (
                    <p className="mt-1 text-sm font-medium text-destructive">{labels.warning}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
