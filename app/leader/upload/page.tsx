import { redirect } from 'next/navigation'
import { Send } from 'lucide-react'
import { SubmitForm, type BrandProject } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { DateSelect } from '@/components/date-select'
import { PersonHandlesLine } from '@/components/person-handles'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderScope } from '@/lib/leaders'
import {
  getActiveContract,
  getAllProjects,
  getCreatorById,
  getCreatorCountsByPlatformOnDate,
  getServerNowIso,
  getServerTimeHm,
  getSubmissionsForCreatorOnDate,
  goalsForContract,
} from '@/lib/queries'
import { operationalDayFromIso } from '@/lib/operational-day'
import { findMiyqatProject } from '@/lib/project-scope'
import { loginHandleFor } from '@/lib/usernames'
import { PLATFORMS } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function LeaderUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  const [locale, scope, { date: dateParam }] = await Promise.all([
    getLocale(),
    getLeaderScope(session.id),
    searchParams,
  ])
  const t = createT(locale)
  const creator = scope.ownId != null ? await getCreatorById(scope.ownId) : null

  if (!creator) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {t('leaderNoReposter')}
      </p>
    )
  }

  const [serverNow, defaultTime, projects] = await Promise.all([
    getServerNowIso(),
    getServerTimeHm(),
    getAllProjects(),
  ])
  const today = operationalDayFromIso(serverNow)
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const username = loginHandleFor(creator).handle || creator.name

  const miqatId = findMiyqatProject(projects)?.id ?? null
  const notekId = projects.find((p) => /notek|نوتك/i.test(p.name))?.id ?? null
  const clean = (h: string | null | undefined) => (h ?? '').trim().replace(/^@+/, '').toLowerCase()
  const brandProjects: BrandProject[] = [
    notekId != null
      ? {
          projectId: notekId,
          handles: [creator.notek_tiktok_username, creator.notek_instagram_username].map(clean).filter(Boolean),
        }
      : null,
    miqatId != null
      ? {
          projectId: miqatId,
          handles: [creator.miqat_tiktok_username, creator.miqat_instagram_username].map(clean).filter(Boolean),
        }
      : null,
  ].filter((b): b is BrandProject => b != null && b.handles.length > 0)

  const [counts, submissions, active] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getActiveContract(creator.id, today),
  ])
  const goals = goalsForContract(creator, active)
  const fields = PLATFORMS.map((platform) => ({
    platform,
    goal: goalFor({ goal_instagram: goals.goalInstagram, goal_tiktok: goals.goalTiktok }, platform),
    todayCount: counts[platform],
  }))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <header className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">{t('leaderUploadAs')}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          {creator.name} <span className="text-sm font-normal text-muted-foreground">· {t('leaderOwnAccount')}</span>
        </h2>
        <PersonHandlesLine person={creator} className="mt-1 text-xs text-muted-foreground" />
        <p className="mt-2 text-xs text-muted-foreground">
          {t('dailyGoal')}: {t('instagram')} {goals.goalInstagram} · {t('tiktok')} {goals.goalTiktok}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t('addLinks')}</h2>
        </div>
        <SubmitForm
          username={username}
          fields={fields}
          projects={projects}
          videoDate={date}
          defaultTime={defaultTime}
          brandProjects={brandProjects}
          labels={{
            pasteLinks: t('pasteLinks'),
            pasteHint: t('pasteLinksHint'),
            send: t('submitVideos'),
            sendTo: t('submitVideosTo'),
            sending: '…',
            project: t('submitProject'),
            projectHint: t('submitProjectHint'),
            pickProject: t('pickProject'),
            autoProject: t('autoProject'),
            postDate: t('postDate'),
            postTime: t('postTime'),
            postWhenHint: t('submitTimeHint'),
          }}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('chooseDay')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('chooseDayHint')}</p>
          </div>
          <DateSelect date={date} />
        </div>
        {date !== today ? (
          <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">{t('addingPast')}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('todaysVideos')}</h2>
        <TodayVideos
          username={username}
          submissions={submissions}
          locale={locale}
          projects={projects}
          changeProjectLabel={t('changeProject')}
        />
      </section>
    </div>
  )
}
