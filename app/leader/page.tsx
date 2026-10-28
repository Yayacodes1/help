import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderBoard, getLeaderScope } from '@/lib/leaders'
import { LEADER_TABS, resolveLeaderTab } from '@/lib/leader-tabs'
import { getTeamMembers, teamReport } from '@/lib/leader-portal'
import {
  attachTracking,
  getAdminSubmissions,
  getAdminSubmissionStats,
  getAllProjects,
  getCreatorsWithProgressOnDate,
  getLoginHandles,
  getOperationalToday,
  getServerToday,
} from '@/lib/queries'
import {
  getDailyAnalytics,
  getDailyViewsByCreator,
  getTopVideos,
  getViewsLeaderboard,
  getViewsSummary,
} from '@/lib/analytics'
import { getAttendanceForDay } from '@/lib/attendance'
import { getActivityForDay } from '@/lib/activity'
import { monthRange } from '@/lib/campaign'
import { formatDate, formatNumber } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import { roleFilterToSql, type RoleFilter } from '@/lib/participant-role'
import type { Platform } from '@/lib/db'
import { PanelBoard, type PanelItem } from '@/components/admin/panel-board'
import { StatCard } from '@/components/stat-card'
import { TodayProgress } from '@/components/admin/today-progress'
import { DayNavigator } from '@/components/admin/day-navigator'
import { AttentionBoard } from '@/components/admin/attention-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { FiltersBar } from '@/components/admin/filters-bar'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { idsOnPage } from '@/lib/refresh-scope'
import { AnalyticsPanel } from '@/components/admin/analytics-panel'
import { TopVideosPanel } from '@/components/admin/top-videos-panel'
import { RoleSelector } from '@/components/admin/role-selector'
import { DailyCheckList } from '@/components/leader/daily-check-list'
import { ReposterCheckBoard } from '@/components/leader/reposter-check-board'
import { TaskEditor } from '@/components/leader/task-editor'
import { BreakRequestForm } from '@/components/leader/break-request-form'
import { listBreakRequests } from '@/lib/break-requests'
import { CopyTextButton } from '@/components/leader/copy-text-button'
import { ConsistencyBoard, CreatorCards, ManageList } from '@/components/leader/team-boards'
import { listLeaderTasks } from '@/lib/tasks'
import { videoPaging } from '@/lib/video-page'
import { getReposterChecksForTeam } from '@/lib/reposter-checks'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LEADER_REFRESH = '/api/leader/refresh-views'

function withPanel(sp: Record<string, string | undefined>, panel: string) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (value) next.set(key, value)
  }
  next.set('tab', 'today')
  next.set('panel', panel)
  return `/leader?${next.toString()}`
}

export default async function LeaderHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  const [locale, sp, today, opToday, projects, scope] = await Promise.all([
    getLocale(),
    searchParams,
    getServerToday(),
    getOperationalToday(),
    getAllProjects(),
    getLeaderScope(session.id),
  ])
  const t = createT(locale)
  const breakFormLabels = {
    hint: t('breakRequestHint'),
    person: t('breakRequestPerson'),
    kind: t('breakRequestKind'),
    kindBreak: t('breakRequestKindBreak'),
    kindPause: t('breakRequestKindPause'),
    pauseHint: t('breakRequestPauseHint'),
    start: t('breakRequestStart'),
    days: t('breakRequestDays'),
    reason: t('breakRequestReason'),
    reasonPh: t('breakRequestReasonPh'),
    send: t('breakRequestSend'),
    empty: t('breakRequestEmpty'),
    pending: t('breakRequestPending'),
    approved: t('breakRequestApproved'),
    denied: t('breakRequestDenied'),
    giveBreak: t('breakRequestGive'),
    givePause: t('breakRequestGivePause'),
    waitingGive: t('breakRequestWaitingGive'),
    applied: t('breakRequestApplied'),
    creator: t('creatorRole'),
    reposter: t('reposterRole'),
  }
  const tab = resolveLeaderTab(sp.tab, sp.panel)
  const { start: monthStart, end: monthEnd } = monthRange(today)
  const date = (value: string | undefined, fallback: string) => (DATE_RE.test(value ?? '') ? value! : fallback)

  const roleFilter: RoleFilter = sp.role === 'creator' || sp.role === 'reposter' ? sp.role : 'all'
  const roleSql = roleFilterToSql(roleFilter)
  const projectRaw = Number(sp.project)
  const projectId = sp.project && Number.isFinite(projectRaw) && projectRaw > 0 ? projectRaw : undefined
  const platform: Platform | undefined =
    sp.platform === 'instagram' || sp.platform === 'tiktok' ? sp.platform : undefined
  const selectedDay = date(sp.day, today)
  const isToday = selectedDay === today
  const dayLabel = isToday ? t('today') : formatDate(selectedDay)
  const teamIds = scope.teamIds
  const inRole = (role: string) => roleFilter === 'all' || role === roleFilter
  const videosOpen = tab === 'today' && sp.panel === 'videos'
  const { page: vPage, pageSize: vSize, offset: vOffset } = videoPaging(sp)
  const videoFilters = {
    projectId,
    role: roleSql,
    creatorId: Number.isFinite(Number(sp.creator)) && Number(sp.creator) > 0 ? Number(sp.creator) : undefined,
    platform,
    from: date(sp.from, monthStart),
    to: date(sp.to, monthEnd),
    creatorIds: scope.videoIds,
  }

  const consistencyOpen = tab === 'today' && sp.panel === 'consistency'

  async function loadToday() {
    const [board, progress, attendance, submissions, videoStats, members, activityMarks, tasks, breakRequests] = await Promise.all([
      getLeaderBoard(opToday),
      getCreatorsWithProgressOnDate(selectedDay, projectId, roleSql, {
        creatorIds: teamIds,
        includeAllCreators: true,
        includeAllReposters: true,
      }),
      getAttendanceForDay(selectedDay, projectId ?? null),
      videosOpen
        ? getAdminSubmissions({ ...videoFilters, limit: vSize, offset: vOffset })
        : Promise.resolve([]),
      getAdminSubmissionStats(videoFilters),
      consistencyOpen ? getTeamMembers(teamIds, today) : Promise.resolve([]),
      getActivityForDay(selectedDay, teamIds),
      listLeaderTasks(session!.id, { today: opToday }),
      listBreakRequests({ leaderId: session!.id }),
    ])
    const tracked = await attachTracking(progress, today)
    const ids = new Set(teamIds)
    const handles = await getLoginHandles(scope.videoIds)
    const groupedReposterIds = [...handles.entries()]
      .filter(([, row]) => row.role === 'reposter')
      .map(([id]) => id)
    const checkMap = await getReposterChecksForTeam(groupedReposterIds, selectedDay)
    return {
      score: board.leaders.find((row) => row.leaderId === session!.id) ?? null,
      people: tracked.filter((c) => !c.paused_at),
      everyone: tracked,
      attention: attendance.filter((p) => ids.has(p.id) && inRole(p.role)),
      submissions,
      videoStats,
      members: members.filter((m) => inRole(m.person.role)),
      activityMarks,
      tasks,
      breakRequests,
      handles,
      checkMap,
    }
  }

  async function loadAnalytics() {
    const aFrom = date(sp.aFrom, monthStart)
    const aTo = date(sp.aTo, monthEnd)
    const aRole: RoleFilter = sp.aRole === 'creator' || sp.aRole === 'reposter' || sp.aRole === 'all' ? sp.aRole : roleFilter
    const aProjectRaw = Number(sp.aProject)
    const aProjectId =
      sp.aProject === 'all' ? null : Number.isFinite(aProjectRaw) && aProjectRaw > 0 ? aProjectRaw : (projectId ?? null)
    const range = {
      from: aFrom,
      to: aTo,
      projectId: aProjectId,
      role: roleFilterToSql(aRole),
      creatorIds: scope.videoIds,
    }
    const tvFrom = date(sp.tvFrom, monthStart)
    const tvTo = date(sp.tvTo, monthEnd)
    const [daily, byCreatorDaily, leaderboard, summary, topVideos] = await Promise.all([
      getDailyAnalytics(range),
      getDailyViewsByCreator(range),
      getViewsLeaderboard({ ...range, limit: 1000 }),
      getViewsSummary(range),
      getTopVideos({
        from: tvFrom,
        to: tvTo,
        projectId: projectId ?? null,
        role: roleSql,
        platform: sp.tvPlatform === 'instagram' || sp.tvPlatform === 'tiktok' ? sp.tvPlatform : null,
        limit: 50,
        creatorIds: scope.videoIds,
      }),
    ])
    return { aFrom, aTo, aRole, aProjectId, tvFrom, tvTo, daily, byCreatorDaily, leaderboard, summary, topVideos }
  }

  async function loadTeam() {
    const [members, breakRequests] = await Promise.all([
      getTeamMembers(teamIds, today, { withMoney: true }),
      listBreakRequests({ leaderId: session!.id }),
    ])
    return { members, breakRequests }
  }

  const todayData = tab === 'today' ? await loadToday() : null
  const analyticsData = tab === 'analytics' ? await loadAnalytics() : null
  const teamData = tab === 'team' ? await loadTeam() : null

  const tabPanels: readonly string[] = LEADER_TABS[tab]
  const defaultPanel =
    sp.panel && tabPanels.includes(sp.panel)
      ? sp.panel
      : tab === 'today'
        ? 'check'
        : tab === 'team'
          ? 'creators'
          : 'analytics'

  const attentionLabels = {
    legendHit: t('attentionHit'),
    legendPartial: t('attentionPartial'),
    legendMiss: t('attentionMiss'),
    legendBreak: t('attentionBreak'),
    legendOff: t('attentionOff'),
    missing: t('attentionNoPost'),
    allClear: t('allClear'),
    strikes: t('strikeCount'),
  }

  const panels: PanelItem[] = []

  if (todayData) {
    const {
      score,
      people,
      everyone,
      attention,
      submissions,
      videoStats,
      members,
      activityMarks,
      tasks,
      breakRequests,
      handles,
      checkMap,
    } = todayData
    const groupCreators = [...handles.entries()]
      .filter(([, row]) => row.role === 'creator')
      .map(([id, row]) => ({ id, handle: row.handle }))
    const groupReposters = [...handles.entries()]
      .filter(([, row]) => row.role === 'reposter')
      .map(([id, row]) => ({
        id,
        handle: row.handle,
        checkedIds: [...(checkMap.get(id) ?? [])],
      }))
    const reposterTicks = groupReposters.reduce((sum, row) => sum + row.checkedIds.length, 0)
    const reposterTickTotal = groupReposters.length * groupCreators.length
    const roster = (score?.people ?? []).filter((p) => inRole(p.role))
    const creatorRoster = roster.filter((p) => p.role === 'creator')
    const reposterRoster = roster.filter((p) => p.role === 'reposter')
    const checkLabels = {
      mark: t('leaderMark'),
      undo: t('leaderUndo'),
      save: t('leaderSaveNote'),
      notePh: t('leaderNotePh'),
      posted: t('leaderPosted'),
      partial: t('leaderPartial'),
      missed: t('leaderMissed'),
      onBreak: t('leaderBreak'),
      off: t('leaderOff'),
      creatorRole: t('creatorRole'),
      reposterRole: t('reposterRole'),
    }
    const goalTotal = people.reduce((sum, c) => sum + c.goal_instagram + c.goal_tiktok, 0)
    const postedTotal = people.reduce((sum, c) => sum + c.today_instagram + c.today_tiktok, 0)
    const postedPeople = people.filter((c) => c.today_instagram + c.today_tiktok > 0).length
    const behind = attention.filter((p) => p.status === 'miss' || p.status === 'partial').length
    const views = videoStats.views
    const videoCount = videoStats.count
    const activeMembers = members.filter((m) => !m.paused)
    const trackedActive = people.filter((c) => !c.paused_at)
    const avgHit =
      activeMembers.length > 0
        ? Math.round((activeMembers.reduce((sum, m) => sum + m.hitRate, 0) / activeMembers.length) * 100)
        : trackedActive.length > 0
          ? Math.round((trackedActive.reduce((sum, c) => sum + c.hit_rate, 0) / trackedActive.length) * 100)
          : null
    const consistencyPeople = activeMembers.length > 0 ? activeMembers.length : trackedActive.length

    panels.push(
      {
        id: 'check',
        title: t('leaderDailyCheckCreators'),
        summary: `${creatorRoster.filter((p) => p.checked).length}/${creatorRoster.length}`,
        hint: opToday,
        children: (
          <DailyCheckList
            people={creatorRoster}
            day={opToday}
            emptyLabel={t('leaderNoPeople')}
            switchHref={withPanel(sp, 'checkReposters')}
            switchLabel={t('leaderSeeReposters')}
            hint={t('leaderDailyCheckHint')}
            labels={checkLabels}
          />
        ),
      },
      {
        id: 'checkReposters',
        title: t('leaderDailyCheckReposters'),
        summary: `${reposterRoster.filter((p) => p.checked).length}/${reposterRoster.length}`,
        hint: opToday,
        children: (
          <DailyCheckList
            people={reposterRoster}
            day={opToday}
            emptyLabel={t('leaderNoPeople')}
            switchHref={withPanel(sp, 'check')}
            switchLabel={t('leaderSeeCreators')}
            hint={t('leaderDailyCheckRepostersHint')}
            labels={checkLabels}
          />
        ),
      },
      {
        id: 'reposterChecks',
        title: t('leaderReposterChecks'),
        summary: groupCreators.length === 0 ? '—' : `${reposterTicks}/${reposterTickTotal}`,
        hint: selectedDay,
        children: (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{t('leaderReposterChecksHint')}</p>
            <ReposterCheckBoard
              creators={groupCreators}
              reposters={groupReposters}
              emptyLabel={t('leaderNoPeople')}
            />
          </div>
        ),
      },
      {
        id: 'tasks',
        title: t('tasksTitle'),
        summary: `${tasks.length}`,
        hint: t('tasksLeaderHint'),
        children: (
          <TaskEditor
            tasks={tasks}
            labels={{
              title: t('tasksTitle'),
              hint: t('tasksLeaderHint'),
              add: t('tasksAdd'),
              save: t('tasksSave'),
              remove: t('tasksRemove'),
              empty: t('tasksEmpty'),
              placeholder: t('tasksPlaceholder'),
              pin: t('tasksPin'),
              unpin: t('tasksUnpin'),
              pinAdd: t('tasksPinAdd'),
            }}
          />
        ),
      },
      {
        id: 'breakRequest',
        title: t('breakRequestTitle'),
        summary: `${breakRequests.filter((r) => r.status === 'pending' || (r.status === 'approved' && !r.applied_at)).length}`,
        hint: t('breakRequestHint'),
        children: (
          <BreakRequestForm
            today={today}
            people={everyone.map((c) => ({
              id: c.id,
              name: c.name,
              role: c.role,
              paused: c.paused_at != null,
            }))}
            requests={breakRequests}
            labels={breakFormLabels}
          />
        ),
      },
      {
        id: 'progress',
        title: isToday ? t('todaysProgress') : t('dailyProgress'),
        summary: `${postedPeople}/${people.length} ${t('active')}`,
        hint: `${postedTotal}/${goalTotal} · ${dayLabel}`,
        children: (
          <div className="flex flex-col gap-3">
            <DayNavigator selectedDay={selectedDay} today={today} />
            <TodayProgress
              creators={people}
              linkScope="leader"
              projectId={projectId}
              emptyLabel={t('leaderNoPeople')}
              activity={{ day: selectedDay, marks: activityMarks }}
            />
          </div>
        ),
      },
      {
        id: 'consistency',
        title: t('consistency'),
        summary: avgHit == null ? '—' : `${avgHit}%`,
        hint: `${consistencyPeople} ${t('people')}`,
        children: <ConsistencyBoard members={members} locale={locale} />,
      },
      {
        id: 'attention',
        title: t('needsAttention'),
        summary: behind === 0 ? t('allClear') : `${behind} ${t('behind')}`,
        hint: dayLabel,
        children: (
          <AttentionBoard
            people={attention}
            selectedDay={selectedDay}
            today={today}
            dayLabel={dayLabel}
            projectId={projectId}
            labels={attentionLabels}
            linkScope="leader"
          />
        ),
      },
      {
        id: 'videos',
        title: t('videos'),
        summary: `${videoCount}`,
        hint: `${formatNumber(views)} ${t('views')}`,
        children: videosOpen ? (
          <div className="flex flex-col gap-3">
            <FiltersBar
              creators={everyone}
              projects={projects}
              projectId={projectId}
              today={today}
              defaultFrom={monthStart}
              defaultTo={monthEnd}
              labels={{ allProjects: t('allProjects'), chooseProject: t('chooseProject') }}
            />
            <Suspense fallback={<p className="text-xs text-muted-foreground">…</p>}>
              <RefreshViewsButton
                label={t('refreshViews')}
                allLabel={t('refreshAllViews')}
                defaultFrom={monthStart}
                defaultTo={monthEnd}
                endpoint={LEADER_REFRESH}
                defaultRole="all"
                submissionIds={idsOnPage(submissions)}
              />
            </Suspense>
            <SubmissionsTable
              submissions={submissions}
              emptyLabel={t('noVideosMatch')}
              editableViews={false}
              projectId={projectId}
              linkScope="leader"
              refreshEndpoint={LEADER_REFRESH}
              refreshLabel={t('refreshThisVideo')}
              noProjectLabel={t('noProject')}
              page={vPage}
              pageSize={vSize}
              total={videoCount}
            />
          </div>
        ) : null,
      },
    )
  }

  if (analyticsData) {
    const a = analyticsData
    panels.push(
      {
        id: 'analytics',
        title: t('analytics'),
        summary: formatNumber(a.summary.views),
        hint: `${a.summary.videos} ${t('videos')} · ${a.aFrom.slice(5)}→${a.aTo.slice(5)}`,
        children: (
          <AnalyticsPanel
            daily={a.daily}
            byCreatorDaily={a.byCreatorDaily}
            leaderboard={a.leaderboard}
            summary={a.summary}
            projects={projects}
            projectId={a.aProjectId}
            role={a.aRole}
            today={today}
            defaultFrom={a.aFrom}
            defaultTo={a.aTo}
            allowSheet={false}
            labels={{
              views: t('views'),
              videos: t('videos'),
              roleCreators: t('roleFilterCreators'),
              roleReposters: t('roleFilterReposters'),
              roleAll: t('roleFilterAll'),
              month: t('rankingMonth'),
              people: t('people'),
              loading: t('analyticsLoading'),
              day: t('analyticsDay'),
              prevDay: t('analyticsPrevDay'),
              nextDay: t('analyticsNextDay'),
              openSheet: t('analyticsOpenSheet'),
              instagram: t('instagram'),
              tiktok: t('tiktok'),
              showVideos: t('showVideos'),
              topCreators:
                a.aRole === 'reposter' ? t('topReposters') : a.aRole === 'all' ? t('topPeople') : t('topCreators'),
              empty: t('analyticsEmpty'),
              from: t('from'),
              to: t('to'),
              apply: t('apply'),
              chartLine: t('chartLine'),
              chartBar: t('chartBar'),
              chartLog: t('chartLog'),
              chartLinear: t('chartLinear'),
              allProjects: t('allProjects'),
              total: t('analyticsTotal'),
              clear: t('analyticsClear'),
              pickHint: t('analyticsPickHint'),
              splitPlatforms: t('analyticsSplit'),
            }}
          />
        ),
      },
      {
        id: 'topvideos',
        title: 'Top videos',
        summary: a.topVideos[0] ? formatNumber(a.topVideos[0].views) : '0',
        hint: `${a.topVideos.length} · ${a.tvFrom.slice(5)}→${a.tvTo.slice(5)}`,
        children: (
          <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
            <TopVideosPanel
              videos={a.topVideos}
              projects={projects}
              projectId={projectId}
              today={today}
              defaultFrom={a.tvFrom}
              defaultTo={a.tvTo}
              linkScope="leader"
              labels={{ allProjects: t('allProjects'), chooseProject: t('chooseProject') }}
            />
          </Suspense>
        ),
      },
    )
  }

  if (teamData) {
    const members = teamData.members
    const creators = members.filter((m) => m.person.role === 'creator' && !m.paused)
    const active = members.filter((m) => !m.paused)
    panels.push(
      {
        id: 'creators',
        title: t('leaderContentCreators'),
        summary: `${creators.length}`,
        hint: `${formatNumber(creators.reduce((sum, m) => sum + m.monthViews, 0))} ${t('views')}`,
        children: <CreatorCards members={members} locale={locale} />,
      },
      {
        id: 'manage',
        title: t('manage'),
        summary: `${active.length} ${t('people')}`,
        hint: `${t('roleFilterCreators')} ${creators.length} · ${t('roleFilterReposters')} ${
          active.length - creators.length
        }`,
        children: <ManageList members={members} locale={locale} />,
      },
      {
        id: 'breakRequest',
        title: t('breakRequestTitle'),
        summary: `${teamData.breakRequests.filter((r) => r.status === 'pending' || (r.status === 'approved' && !r.applied_at)).length}`,
        hint: t('breakRequestHint'),
        children: (
          <BreakRequestForm
            today={today}
            people={members.map((m) => ({
              id: m.person.id,
              name: m.person.name,
              role: m.person.role,
              paused: m.paused,
            }))}
            requests={teamData.breakRequests}
            labels={breakFormLabels}
          />
        ),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('leaderTeamHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {teamData ? (
            <CopyTextButton
              text={teamReport(t, session.name, today, teamData.members)}
              label={t('leaderCopyTeamReport')}
              copiedLabel={t('leaderCopied')}
            />
          ) : null}
          {tab !== 'team' ? (
            <Suspense fallback={null}>
              <RoleSelector
                defaultRole="all"
                labels={{
                  creators: t('roleFilterCreators'),
                  reposters: t('roleFilterReposters'),
                  all: t('roleFilterAll'),
                }}
              />
            </Suspense>
          ) : null}
        </div>
      </div>

      {todayData ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={isToday ? t('postedToday') : t('postedThatDay')}
            value={`${todayData.people.reduce((s, c) => s + c.today_instagram + c.today_tiktok, 0)} / ${todayData.people.reduce(
              (s, c) => s + c.goal_instagram + c.goal_tiktok,
              0,
            )}`}
          />
          <StatCard
            label={isToday ? t('peopleActiveToday') : t('peopleActiveThatDay')}
            value={`${todayData.people.filter((c) => c.today_instagram + c.today_tiktok > 0).length} / ${todayData.people.length}`}
          />
          <StatCard
            label={t('totalViews')}
            value={formatNumber(todayData.submissions.reduce((s, v) => s + (v.views ?? 0), 0))}
          />
          <StatCard
            label={t('needsAttention')}
            value={todayData.attention.filter((p) => p.status === 'miss' || p.status === 'partial').length}
          />
        </section>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t('tapSection')}</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
        <PanelBoard key={tab} defaultOpen={defaultPanel} columns={3} closeLabel={t('close')} panels={panels} />
      </Suspense>
    </div>
  )
}
