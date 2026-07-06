import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import {
  getAdminSubmissions,
  getAllProjects,
  getCreatorsWithProgressOnDate,
  getServerToday,
  type AdminFilters,
} from '@/lib/queries'
import { yearRange } from '@/lib/campaign'
import { StatCard } from '@/components/stat-card'
import { FiltersBar } from '@/components/admin/filters-bar'
import { ViewsCell } from '@/components/admin/views-cell'
import { DeleteSubmission } from '@/components/admin/delete-submission'
import { ProjectsManager } from '@/components/admin/projects-manager'
import { CreatorsManager } from '@/components/admin/creators-manager'
import { ProjectSelector } from '@/components/admin/project-selector'
import { TodayProgress } from '@/components/admin/today-progress'
import { DayNavigator } from '@/components/admin/day-navigator'
import { LogoutButton } from '@/components/admin/logout-button'
import { formatDate, formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { Platform } from '@/lib/db'

export const dynamic = 'force-dynamic'

const PLATFORM_SET = new Set<Platform>(['instagram', 'tiktok'])

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string
    creator?: string
    platform?: string
    from?: string
    to?: string
    day?: string
  }>
}) {
  if (!(await isAdmin())) redirect('/login')

  const sp = await searchParams
  const platform =
    sp.platform && PLATFORM_SET.has(sp.platform as Platform)
      ? (sp.platform as Platform)
      : undefined
  const today = await getServerToday()
  const { start: yearStart, end: yearEnd } = yearRange(today)

  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? '') ? sp.day! : today
  const isToday = selectedDay === today

  const projectId = sp.project ? Number(sp.project) : undefined

  const filters: AdminFilters = {
    projectId,
    creatorId: sp.creator ? Number(sp.creator) : undefined,
    platform,
    from: sp.from || yearStart,
    to: sp.to || yearEnd,
  }

  const [submissions, projects, creators] = await Promise.all([
    getAdminSubmissions(filters),
    getAllProjects(),
    getCreatorsWithProgressOnDate(selectedDay, projectId),
  ])

  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)
  const totalVideos = submissions.length

  const goalTotal = creators.reduce(
    (sum, c) => sum + c.goal_instagram + c.goal_tiktok,
    0,
  )
  const postedTodayTotal = creators.reduce(
    (sum, c) => sum + c.today_instagram + c.today_tiktok,
    0,
  )
  const creatorsPostedToday = creators.filter(
    (c) => c.today_instagram + c.today_tiktok > 0,
  ).length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
        <div className="flex items-center gap-3">
          <ProjectSelector projects={projects} />
          <LogoutButton />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={isToday ? 'Posted today' : 'Posted that day'}
          value={`${postedTodayTotal} / ${goalTotal}`}
        />
        <StatCard
          label={isToday ? 'Creators active today' : 'Creators active that day'}
          value={`${creatorsPostedToday} / ${creators.length}`}
        />
        <StatCard label="Total videos" value={totalVideos} />
        <StatCard label="Total views" value={formatNumber(totalViews)} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {isToday ? "Today's progress" : 'Daily progress'}
          </h2>
          <DayNavigator selectedDay={selectedDay} today={today} />
        </div>
        <TodayProgress creators={creators} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Videos</h2>
        <FiltersBar
          creators={creators}
          defaultFrom={yearStart}
          defaultTo={yearEnd}
        />
      </section>

      <section className="mt-4">
        {submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No videos match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 text-right font-medium">Views</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{s.creator_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {s.project_name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(s.video_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{PLATFORM_META[s.platform].en}</td>
                    <td className="max-w-[220px] px-4 py-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium underline underline-offset-4"
                        dir="ltr"
                      >
                        {s.url}
                      </a>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <ViewsCell id={s.id} views={s.views ?? 0} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <DeleteSubmission id={s.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <CreatorsManager creators={creators} projects={projects} />
        <ProjectsManager projects={projects} />
      </section>
    </main>
  )
}
