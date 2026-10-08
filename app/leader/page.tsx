import Link from 'next/link'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderBoard, formatPlanCompare } from '@/lib/leaders'
import { getOperationalToday } from '@/lib/queries'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LeaderHomePage() {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  const [day, locale] = await Promise.all([getOperationalToday(), getLocale()])
  const t = createT(locale)
  const board = await getLeaderBoard(day)
  const score = board.leaders.find((row) => row.leaderId === session.id)
  const compare = formatPlanCompare(
    score?.todayPct ?? null,
    score?.yesterdayPct ?? null,
    t('today'),
    t('leaderYesterday'),
  )
  const people = score?.people ?? []
  const missed = people.filter((p) => p.status === 'miss' || p.status === 'partial')

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">{day}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('leaderBatch')}</h2>
        <p className="mt-2 text-lg tabular-nums">{compare}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('leaderPayHidden')}</p>
      </header>
      {missed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {people.length === 0 ? t('leaderNoPeople') : t('leaderAllPosted')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {missed.map((person) => (
            <li key={person.id}>
              <Link
                href={`/leader/creators/${person.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary/40"
              >
                <span className="font-medium">{person.name}</span>
                <span className="text-muted-foreground">
                  IG {person.todayInstagram}/{person.goalInstagram} · TT {person.todayTiktok}/{person.goalTiktok}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
