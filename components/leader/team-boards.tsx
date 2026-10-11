import Link from 'next/link'
import { PersonHandlesLine } from '@/components/person-handles'
import type { DayStatus } from '@/lib/consistency'
import { leaderPersonHref } from '@/lib/admin-href'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { createT, type Locale } from '@/lib/i18n'
import { cadenceLabel, viewsBonusLine, type TeamMember } from '@/lib/leader-portal'
import { projectToneClass } from '@/lib/project-scope'

const DAY_CLASS: Record<DayStatus, string> = {
  hit: 'bg-emerald-500/90',
  partial: 'bg-amber-400/90',
  miss: 'bg-rose-500/80',
  none: 'bg-muted',
  future: 'border border-dashed border-border',
  break: 'bg-sky-400/90',
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function RoleTag({ role, t }: { role: string; t: ReturnType<typeof createT> }) {
  return (
    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {role === 'reposter' ? t('reposterRole') : t('creatorRole')}
    </span>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>
  )
}

/** Every team member's contract consistency, with the last two weeks at a glance. */
export function ConsistencyBoard({ members, locale }: { members: TeamMember[]; locale: Locale }) {
  const t = createT(locale)
  const active = members.filter((m) => !m.paused)
  if (active.length === 0) return <Empty text={t('leaderNoPeople')} />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(
          [
            ['hit', t('leaderPosted')],
            ['partial', t('leaderPartial')],
            ['miss', t('leaderMissed')],
            ['break', t('leaderBreak')],
            ['none', t('leaderOff')],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${DAY_CLASS[status]}`} />
            {label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">{t('people')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('hitRate')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('currentStreak')}</th>
              <th className="px-3 py-2 text-center font-medium">{t('bestStreak')}</th>
              <th className="px-3 py-2 text-center font-medium">
                {t('leaderMissed')} / {t('leaderPartial')}
              </th>
              <th className="px-3 py-2 text-start font-medium">{t('leaderLastDays')}</th>
            </tr>
          </thead>
          <tbody>
            {active.map((m) => (
              <tr key={m.person.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={leaderPersonHref(m.person.id, { panel: 'consistency' })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {m.person.name}
                    </Link>
                    <RoleTag role={m.person.role} t={t} />
                  </div>
                  <p className="text-xs text-muted-foreground">{m.active?.name ?? t('noContractSet')}</p>
                </td>
                <td className="px-3 py-2 text-center font-semibold tabular-nums">{pct(m.hitRate)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{m.currentStreak}</td>
                <td className="px-3 py-2 text-center tabular-nums">{m.bestStreak}</td>
                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                  {m.missDays} / {m.partialDays}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-0.5" dir="ltr">
                    {m.recent.map((d) => (
                      <span
                        key={d.date}
                        title={`${d.date} · IG ${d.instagram}/${d.goalInstagram} · TT ${d.tiktok}/${d.goalTiktok}`}
                        className={`inline-block size-3.5 rounded-sm ${DAY_CLASS[d.status]}`}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** One card per content creator on the team. */
export function CreatorCards({ members, locale }: { members: TeamMember[]; locale: Locale }) {
  const t = createT(locale)
  const creators = members.filter((m) => m.person.role === 'creator' && !m.paused)
  if (creators.length === 0) return <Empty text={t('leaderNoPeople')} />
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {creators.map((m) => {
        const compare = m.activeCompare
        const rate = compare?.displayRate ?? m.hitRate
        const money = (n: number) => formatMoney(n, m.currency)
        const base = Number(m.active?.base_amount) || 0
        return (
          <div key={m.person.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={leaderPersonHref(m.person.id)}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {m.person.name}
                </Link>
                <PersonHandlesLine person={m.person} />
              </div>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${projectToneClass(m.person.project_name)}`}
              >
                {m.person.project_name ?? t('bothProjects')}
              </span>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium">{m.active?.name ?? t('noContractSet')}</span>
                <span className="tabular-nums text-muted-foreground">{pct(rate)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, Math.round(rate * 100)))}%` }}
                />
              </div>
              {compare ? (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {compare.videoCount}
                  {compare.targetTotal > 0 ? `/${compare.targetTotal}` : ''} {t('videos').toLowerCase()}
                  {m.active?.end_date ? ` · → ${formatDate(m.active.end_date)}` : ''}
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-secondary/50 p-2">
                <dt className="text-muted-foreground">{t('leaderMonthViews')}</dt>
                <dd className="text-sm font-semibold tabular-nums">{formatNumber(m.monthViews)}</dd>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <dt className="text-muted-foreground">{t('currentStreak')}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {m.currentStreak} · {pct(m.hitRate)}
                </dd>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <dt className="text-muted-foreground">{t('leaderAgreed')}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {m.active ? `${money(base)} · ${cadenceLabel(t, m.active)}` : '—'}
                </dd>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2">
                <dt className="text-muted-foreground">{t('leaderBonusEarned')}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {m.bonusEarned != null ? formatMoney(m.bonusEarned, 'SAR') : '—'}
                </dd>
              </div>
            </dl>
            <Link
              href={leaderPersonHref(m.person.id)}
              className="mt-auto inline-flex h-9 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-accent"
            >
              {t('leaderOpenProfile')}
            </Link>
          </div>
        )
      })}
    </div>
  )
}

/** Everyone the admin assigned to this leader, with the numbers a report needs. */
export function ManageList({ members, locale }: { members: TeamMember[]; locale: Locale }) {
  const t = createT(locale)
  if (members.length === 0) return <Empty text={t('leaderNoPeople')} />
  const groups = [
    { key: 'active', title: null, rows: members.filter((m) => !m.paused) },
    { key: 'paused', title: t('leaderPaused'), rows: members.filter((m) => m.paused) },
  ]
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('leaderTeamHint')}</p>
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.key} className="flex flex-col gap-2">
            {group.title ? <h3 className="text-sm font-semibold">{group.title}</h3> : null}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-start font-medium">{t('people')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('contracts')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('leaderAgreed')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('totalPaid')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('stillDue')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('leaderBonus')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('leaderMonthViews')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((m) => {
                    const money = (n: number) => formatMoney(n, m.currency)
                    const compare = m.activeCompare
                    const bonus = m.active ? viewsBonusLine(t, m.active) : null
                    return (
                      <tr key={m.person.id} className="border-b border-border align-top last:border-0">
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={leaderPersonHref(m.person.id)}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {m.person.name}
                            </Link>
                            <RoleTag role={m.person.role} t={t} />
                          </div>
                          <PersonHandlesLine person={m.person} />
                          <p className="text-xs text-muted-foreground">
                            {m.person.project_name ?? t('bothProjects')}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          {m.active ? (
                            <>
                              <p className="font-medium">{m.active.name}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {formatDate(m.active.start_date)} →{' '}
                                {m.active.end_date ? formatDate(m.active.end_date) : t('openEnded')}
                                {compare
                                  ? ` · ${compare.videoCount}${compare.targetTotal > 0 ? `/${compare.targetTotal}` : ''}`
                                  : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t('noContractSet')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">
                          {m.active ? (
                            <>
                              {money(Number(m.active.base_amount) || 0)}
                              <p className="text-xs text-muted-foreground">{cadenceLabel(t, m.active)}</p>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{compare ? money(compare.paidAmount) : '—'}</td>
                        <td className="px-3 py-2 text-end tabular-nums">
                          {compare ? (compare.balance > 0.009 ? money(compare.balance) : t('leaderSettled')) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.active?.commission_amount != null ? (
                            <p>
                              {t('leaderBonusFlat')} {money(Number(m.active.commission_amount))}
                            </p>
                          ) : null}
                          {bonus ? <p>{bonus}</p> : null}
                          {m.bonusEarned != null && m.bonusEarned > 0 ? (
                            <p className="font-semibold">
                              {t('leaderBonusEarned')} {formatMoney(m.bonusEarned, 'SAR')}
                            </p>
                          ) : null}
                          {!bonus && m.active?.commission_amount == null && !m.bonusEarned ? '—' : null}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">
                          {formatNumber(m.monthViews)}
                          <p className="text-xs text-muted-foreground">
                            {m.monthVideos} {t('videos').toLowerCase()}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}
    </div>
  )
}
