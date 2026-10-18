import { PersonHandlesLine } from '@/components/person-handles'
import { formatNumber } from '@/lib/format'
import { createT, type Locale } from '@/lib/i18n'
import type { TeamMember } from '@/lib/leader-portal'

export function ReposterTeamList({ members, locale }: { members: TeamMember[]; locale: Locale }) {
  const t = createT(locale)
  const people = members.filter((m) => !m.paused)
  if (people.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {t('leaderNoPeople')}
      </p>
    )
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {people.map((m) => (
        <li key={m.person.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{m.person.name}</p>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {m.person.role === 'reposter' ? t('reposterRole') : t('creatorRole')}
            </span>
          </div>
          <PersonHandlesLine person={m.person} />
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-secondary/50 p-2">
              <dt className="text-muted-foreground">{t('hitRate')}</dt>
              <dd className="text-sm font-semibold tabular-nums">{Math.round(m.hitRate * 100)}%</dd>
            </div>
            <div className="rounded-lg bg-secondary/50 p-2">
              <dt className="text-muted-foreground">{t('currentStreak')}</dt>
              <dd className="text-sm font-semibold tabular-nums">{m.currentStreak}</dd>
            </div>
            <div className="col-span-2 rounded-lg bg-secondary/50 p-2">
              <dt className="text-muted-foreground">{t('leaderMonthViews')}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {formatNumber(m.monthViews)} · {m.monthVideos} {t('videos').toLowerCase()}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}
