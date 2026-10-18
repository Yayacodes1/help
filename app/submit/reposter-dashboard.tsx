import { Suspense } from 'react'
import { SubmitForm, type BrandProject } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { DateSelect } from '@/components/date-select'
import { PanelBoard, type PanelItem } from '@/components/admin/panel-board'
import { AnalyticsPanel } from '@/components/admin/analytics-panel'
import { TopVideosPanel } from '@/components/admin/top-videos-panel'
import { ReposterShell } from '@/components/reposter/reposter-shell'
import { ReposterDailyCheck } from '@/components/reposter/daily-check'
import { TaskBoard } from '@/components/reposter/task-board'
import { ReposterTeamList } from '@/components/reposter/team-list'
import { ContestPodium } from '@/components/contest-podium'
import { RankingBoard } from '@/components/ranking-board'
import { StrikeBanner } from '@/components/strike-banner'
import {
  getAllProjects,
  getCreatorCountsByPlatformOnDate,
  getServerTimeHm,
  getServerToday,
  getSubmissionsForCreatorOnDate,
  getActiveContract,
  goalsForContract,
} from '@/lib/queries'
import {
  getDailyAnalytics,
  getDailyViewsByCreator,
  getTopVideos,
  getViewsLeaderboard,
  getViewsSummary,
} from '@/lib/analytics'
import { getLeaderBoard, getLeaderForCreator } from '@/lib/leaders'
import { getTeamMembers } from '@/lib/leader-portal'
import { getActivityForDay } from '@/lib/activity'
import { getTaskCalendar, getTaskChecksForDay, listLeaderTasks } from '@/lib/tasks'
import { REPOSTER_TABS, resolveReposterTab } from '@/lib/reposter-tabs'
import { monthRange } from '@/lib/campaign'
import { getLeagueBoard } from '@/lib/ranking'
import { CONTEST, isContestLive } from '@/lib/contest'
import { findMiyqatProject } from '@/lib/project-scope'
import { squadKeyFromName, squadLabel } from '@/lib/squads'
import { PLATFORMS, type Creator } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { formatNumber } from '@/lib/format'
import { createT, type Locale } from '@/lib/i18n'
import { getCreatorStrikeSummary } from '@/lib/strikes'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function ReposterDashboard({
  creator,
  username,
  locale,
  searchParams,
}: {
  creator: Creator
  username: string
  locale: Locale
  searchParams: { date?: string; tab?: string; panel?: string; taskDay?: string; u?: string }
}) {
  const t = createT(locale)
  const [today, defaultTime, projects, link] = await Promise.all([
    getServerToday(),
    getServerTimeHm(),
    getAllProjects(),
    getLeaderForCreator(creator.id),
  ])
  const tab = resolveReposterTab(searchParams.tab, searchParams.panel)
  const date = DATE_RE.test(searchParams.date ?? '') ? searchParams.date! : today
  const taskDay = DATE_RE.test(searchParams.taskDay ?? '') ? searchParams.taskDay! : today
  const { start: monthStart, end: monthEnd } = monthRange(today)
  const teamIds = link?.teamIds ?? []
  const videoIds = teamIds.length > 0 ? teamIds : [creator.id]
  const squadName = link ? squadLabel(squadKeyFromName(link.leaderName)) : null
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

  const [counts, ownVideos, active, strikeSummary] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getActiveContract(creator.id, today),
    getCreatorStrikeSummary(creator.id, today),
  ])
  const dailyGoals = goalsForContract(creator, active)
  const fields = PLATFORMS.map((platform) => ({
    platform,
    goal: goalFor(
      { goal_instagram: dailyGoals.goalInstagram, goal_tiktok: dailyGoals.goalTiktok },
      platform,
    ),
    todayCount: counts[platform],
  }))

  const panels: PanelItem[] = []

  if (tab === 'today') {
    const [board, activityMarks, tasks, checked, calendar] = await Promise.all([
      getLeaderBoard(date),
      getActivityForDay(date, videoIds),
      link ? listLeaderTasks(link.leaderId) : Promise.resolve([]),
      getTaskChecksForDay(creator.id, taskDay),
      link ? getTaskCalendar(creator.id, link.leaderId, today) : Promise.resolve([]),
    ])
    const score = link ? (board.leaders.find((row) => row.leaderId === link.leaderId) ?? null) : null
    const roster = score?.people ?? []
    const ticked = tasks.filter((task) => checked.has(task.id)).length
    panels.push(
      {
        id: 'check',
        title: t('leaderDailyCheck'),
        summary: `${roster.filter((p) => p.status === 'hit').length}/${roster.length}`,
        hint: link?.leaderName ?? t('leaderNoPeople'),
        children: (
          <ReposterDailyCheck
            people={roster}
            day={date}
            marks={activityMarks}
            actorUsername={username}
            labels={{
              hint: t('reposterDailyCheckHint'),
              empty: t('leaderNoPeople'),
              posted: t('leaderPosted'),
              partial: t('leaderPartial'),
              missed: t('leaderMissed'),
              break: t('leaderBreak'),
              off: t('leaderOff'),
              creator: t('creatorRole'),
              reposter: t('reposterRole'),
            }}
          />
        ),
      },
      {
        id: 'tasks',
        title: t('tasksTitle'),
        summary: tasks.length === 0 ? '—' : `${ticked}/${tasks.length}`,
        hint: taskDay,
        children: (
          <TaskBoard
            username={username}
            day={taskDay}
            today={today}
            tasks={tasks}
            checkedIds={[...checked]}
            calendar={calendar}
            labels={{
              hint: t('tasksHint'),
              empty: t('tasksEmpty'),
              done: t('tasksDone'),
              previous: t('tasksPrevious'),
            }}
          />
        ),
      },
      {
        id: 'videos',
        title: t('videos'),
        summary: `${ownVideos.length}`,
        hint: date,
        children: (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t('chooseDayHint')}</p>
              <DateSelect date={date} />
            </div>
            <TodayVideos
              username={username}
              submissions={ownVideos}
              locale={locale}
              projects={projects}
              changeProjectLabel={t('changeProject')}
            />
          </div>
        ),
      },
    )
  }

  if (tab === 'analytics') {
    const range = { from: monthStart, to: monthEnd, creatorIds: videoIds }
    const [daily, byCreatorDaily, leaderboard, summary, topVideos, league, contestBoard] = await Promise.all([
      getDailyAnalytics(range),
      getDailyViewsByCreator(range),
      getViewsLeaderboard({ ...range, limit: 1000 }),
      getViewsSummary(range),
      getTopVideos({ from: monthStart, to: monthEnd, creatorIds: videoIds }),
      getLeagueBoard({ role: 'reposter' }),
      isContestLive(today) && miqatId != null
        ? getLeagueBoard({ role: 'reposter', from: CONTEST.from, to: CONTEST.to, projectId: miqatId })
        : Promise.resolve(null),
    ])
    panels.push(
      {
        id: 'analytics',
        title: t('analytics'),
        summary: formatNumber(summary.views),
        hint: `${summary.videos} ${t('videos')}`,
        children: (
          <div className="flex flex-col gap-4">
            {contestBoard ? (
              <ContestPodium
                rows={contestBoard.rows}
                highlightId={creator.id}
                labels={{
                  title: t('contestBoardTitle'),
                  empty: t('contestBoardEmpty'),
                  diamond: t('contestDiamond'),
                  gold: t('contestGold'),
                  silver: t('contestSilver'),
                  both: t('contestBoth'),
                  instagram: t('instagram'),
                  tiktok: t('tiktok'),
                }}
              />
            ) : null}
            {league ? (
              <RankingBoard
                board={league}
                highlightId={creator.id}
                collapsedLimit={5}
                showSearch={false}
                identity="handle"
                labels={{
                  title: t('rankingTitle'),
                  empty: t('rankingEmpty'),
                  expand: t('rankingExpand'),
                  collapse: t('rankingCollapse'),
                  search: t('rankingSearch'),
                  rank: t('rankingRank'),
                  views: t('views'),
                  videos: t('videosWord'),
                }}
              />
            ) : null}
            <AnalyticsPanel
              daily={daily}
              byCreatorDaily={byCreatorDaily}
              leaderboard={leaderboard}
              summary={summary}
              projects={projects}
              projectId={null}
              role="all"
              today={today}
              defaultFrom={monthStart}
              defaultTo={monthEnd}
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
                topCreators: t('topPeople'),
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
          </div>
        ),
      },
      {
        id: 'topvideos',
        title: 'Top videos',
        summary: topVideos[0] ? formatNumber(topVideos[0].views) : '0',
        hint: `${topVideos.length}`,
        children: (
          <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
            <TopVideosPanel
              videos={topVideos}
              projects={projects}
              projectId={null}
              today={today}
              defaultFrom={monthStart}
              defaultTo={monthEnd}
              labels={{ allProjects: t('allProjects'), chooseProject: t('chooseProject') }}
            />
          </Suspense>
        ),
      },
    )
  }

  if (tab === 'team') {
    const members = await getTeamMembers(teamIds, today)
    panels.push({
      id: 'team',
      title: t('leaderTabTeam'),
      summary: `${members.filter((m) => !m.paused).length}`,
      hint: link?.leaderName ?? t('leaderNoPeople'),
      children: <ReposterTeamList members={members} locale={locale} />,
    })
  }

  if (tab === 'upload') {
    panels.push({
      id: 'upload',
      title: t('leaderTabUpload'),
      summary: `${fields.reduce((s, f) => s + f.todayCount, 0)}`,
      hint: `${t('instagram')} ${dailyGoals.goalInstagram} · ${t('tiktok')} ${dailyGoals.goalTiktok}`,
      children: (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {t('platforms')}: {t('platformsBoth')}
            {' · '}
            {t('dailyGoal')}: {t('instagram')} {dailyGoals.goalInstagram}
            {' · '}
            {t('tiktok')} {dailyGoals.goalTiktok}
          </p>
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
        </div>
      ),
    })
  }

  const tabPanels: readonly string[] = REPOSTER_TABS[tab]
  const defaultPanel =
    searchParams.panel && tabPanels.includes(searchParams.panel)
      ? searchParams.panel
      : tab === 'today'
        ? 'check'
        : tab === 'team'
          ? 'team'
          : tab === 'upload'
            ? 'upload'
            : 'analytics'

  return (
    <ReposterShell locale={locale} username={username} displayName={username} squadName={squadName}>
      {strikeSummary ? (
        <div className="mb-4">
          <StrikeBanner
            count={strikeSummary.contractStrikes}
            postedToday={strikeSummary.postedToday}
            offToday={strikeSummary.offToday}
            labels={{
              none: t('strikeNone'),
              one: t('strikeYouHaveOne'),
              two: t('strikeYouHaveTwo'),
              three: t('strikeYouHaveThree'),
              posted: t('strikePostedToday'),
              missed: t('strikeMissedToday'),
              off: t('strikeOffToday'),
              hint: t('strikesHint'),
            }}
          />
        </div>
      ) : null}
      {!link ? (
        <p className="mb-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('reposterNoLeader')}
        </p>
      ) : null}
      <p className="mb-3 text-xs text-muted-foreground">{t('tapSection')}</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
        <PanelBoard key={tab} defaultOpen={defaultPanel} columns={3} closeLabel={t('close')} panels={panels} />
      </Suspense>
    </ReposterShell>
  )
}
