import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckForm } from '@/components/leader/check-form'
import { CreatorStats } from '@/components/creator-stats'
import { PersonHandlesLine } from '@/components/person-handles'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderBoard } from '@/lib/leaders'
import {
  getActiveContract,
  getCreatorById,
  getCreatorConsistency,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getOperationalToday,
  getSubmissionsForCreatorOnDate,
  goalsForContract,
} from '@/lib/queries'
import { formatNumber } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import { PLATFORM_META } from '@/lib/platforms'

export const dynamic = 'force-dynamic'

export default async function LeaderCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isFinite(id)) notFound()

  const creator = await getCreatorById(id)
  if (!creator || creator.role !== 'creator') notFound()

  const day = await getOperationalToday()
  const board = await getLeaderBoard(day)
  const score = board.leaders.find((row) => row.leaderId === session.id)
  const person = score?.people.find((p) => p.id === id)
  if (!person) notFound()

  const locale = await getLocale()
  const t = createT(locale)
  const [counts, submissions, stats, consistency, active] = await Promise.all([
    getCreatorCountsByPlatformOnDate(id, day),
    getSubmissionsForCreatorOnDate(id, day),
    getCreatorStats(id),
    getCreatorConsistency(creator, day),
    getActiveContract(id, day),
  ])
  const goals = goalsForContract(creator, active)

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-2xl border border-border bg-card p-5">
        <Link href="/leader" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
          {t('leaderTitle')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{creator.name}</h2>
        <PersonHandlesLine person={creator} className="mt-1 text-sm text-muted-foreground" />
        <p className="mt-3 text-sm">
          {t('instagram')} {counts.instagram}/{goals.goalInstagram}
          {' · '}
          {t('tiktok')} {counts.tiktok}/{goals.goalTiktok}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('leaderPayHidden')}</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('leaderChecked')}</h3>
        <div className="mt-3">
          <CheckForm
            creatorId={id}
            day={day}
            checked={person.checked}
            note={person.note}
            markLabel={t('leaderMark')}
            undoLabel={t('leaderUndo')}
            saveLabel={t('leaderSaveNote')}
            notePlaceholder={t('leaderNotePh')}
          />
        </div>
      </section>

      <CreatorStats
        stats={{
          total_videos: stats.total_videos,
          instagram_videos: stats.instagram_videos,
          tiktok_videos: stats.tiktok_videos,
          active_days: stats.active_days,
          current_streak: consistency.currentStreak,
          best_streak: consistency.bestStreak,
          hit_rate: consistency.hitRate,
        }}
        locale={locale}
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{t('todaysVideos')}</h3>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noVideosYet')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {submissions.map((video) => {
              const meta = PLATFORM_META[video.platform]
              return (
                <li key={video.id} className="flex items-center justify-between gap-3 text-sm">
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline-offset-4 hover:underline">
                    {locale === 'ar' ? meta.ar : meta.en}
                    {video.project_name ? ` · ${video.project_name}` : ''}
                  </a>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(video.views)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
