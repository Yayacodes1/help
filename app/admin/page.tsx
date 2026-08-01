import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  attachTracking,
  getAdminSubmissions,
  getAllProjects,
  getCreatorsWithProgressOnDate,
  getMissesFromProgress,
  getServerToday,
  type AdminFilters,
} from '@/lib/queries'
import { yearRange } from '@/lib/campaign'
import { StatCard } from '@/components/stat-card'
import { FiltersBar } from '@/components/admin/filters-bar'
import { ProjectsManager } from '@/components/admin/projects-manager'
import { CreatorsManager } from '@/components/admin/creators-manager'
import { ProjectSelector } from '@/components/admin/project-selector'
import { TodayProgress } from '@/components/admin/today-progress'
import { DayNavigator } from '@/components/admin/day-navigator'
import { LogoutButton } from '@/components/admin/logout-button'
import { MissList } from '@/components/admin/miss-list'
import { PanelBoard } from '@/components/admin/panel-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { formatDate, formatNumber } from '@/lib/format'
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
    panel?: string
  }>
}) {
  if (!(await isAdmin())) redirect('/login')
  await ensureCreatorTrackingColumns()

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

  const [submissions, projects, creatorsBase] = await Promise.all([
    getAdminSubmissions(filters),
    getAllProjects(),
    getCreatorsWithProgressOnDate(selectedDay, projectId),
  ])
  const creators = await attachTracking(creatorsBase, today)
  const misses = getMissesFromProgress(creatorsBase)

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
  const payDueCount = creators.filter((c) => c.pay_due).length

  const defaultPanel =
    sp.panel && ['progress', 'attention', 'videos', 'manage'].includes(sp.panel)
      ? sp.panel
      : misses.length > 0
        ? 'attention'
        : 'progress'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
        <div className="flex items-center gap-3">
          <ProjectSelector projects={projects} />
          <LogoutButton />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        <StatCard label="Pay due" value={payDueCount} />
      </section>

      <p className="mt-6 mb-3 text-xs text-muted-foreground">
        Tap a section to open it. Only one is open at a time.
      </p>

      <PanelBoard
        defaultOpen={defaultPanel}
        panels={[
          {
            id: 'progress',
            title: isToday ? "Today's progress" : 'Daily progress',
            summary: `${creatorsPostedToday}/${creators.length} active`,
            hint: isToday ? 'Goals for today' : formatDate(selectedDay),
            children: (
              <div className="flex flex-col gap-3">
                <DayNavigator selectedDay={selectedDay} today={today} />
                <TodayProgress creators={creators} />
              </div>
            ),
          },
          {
            id: 'attention',
            title: 'Needs attention',
            summary: misses.length === 0 ? 'All clear' : `${misses.length} behind`,
            hint: isToday ? 'today' : formatDate(selectedDay),
            children: (
              <MissList
                misses={misses}
                dayLabel={isToday ? 'today' : formatDate(selectedDay)}
              />
            ),
          },
          {
            id: 'videos',
            title: 'Videos',
            summary: `${totalVideos}`,
            hint: `${formatNumber(totalViews)} views`,
            children: (
              <div className="flex flex-col gap-3">
                <FiltersBar
                  creators={creators}
                  defaultFrom={yearStart}
                  defaultTo={yearEnd}
                />
                <SubmissionsTable submissions={submissions} />
              </div>
            ),
          },
          {
            id: 'manage',
            title: 'Manage',
            summary: `${creators.length} creators`,
            hint: `${projects.length} projects`,
            children: (
              <div className="grid gap-4 lg:grid-cols-2">
                <CreatorsManager creators={creators} projects={projects} />
                <ProjectsManager projects={projects} />
              </div>
            ),
          },
        ]}
      />
    </main>
  )
}
