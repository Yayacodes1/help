import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { SubmitForm, type BrandProject } from '@/components/submit-form'
import { DateSelect } from '@/components/date-select'
import { PanelBoard, type PanelItem } from '@/components/admin/panel-board'
import { ReposterShell } from '@/components/reposter/reposter-shell'
import { ReposterDailyCheck } from '@/components/reposter/daily-check'
import { TaskBoard } from '@/components/reposter/task-board'
import { ReposterTeamList } from '@/components/reposter/team-list'
import { GroupVideos } from '@/components/reposter/group-videos'
import { VideoDaySwitch } from '@/components/reposter/video-day-switch'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { VideoPager } from '@/components/admin/video-pager'
import { ContestPodium } from '@/components/contest-podium'
import { RankingBoard } from '@/components/ranking-board'
import { StrikeBanner } from '@/components/strike-banner'
const AnalyticsPanel = dynamic(() =>
  import('@/components/admin/analytics-panel').then((m) => m.AnalyticsPanel),
)
import {
  getAdminSubmissions,
  getAdminSubmissionStats,
  getAllProjects,
  getCreatorCountsByPlatformOnDate,
  getCreatorsWithProgressOnDate,
  getLoginHandles,
  getServerTimeHm,
  getServerToday,
  getActiveContract,
  getTeamContractVideoProgress,
  goalsForContract,
  type ContractVideoProgress,
} from '@/lib/queries'
import {
  getDailyAnalytics,
  getDailyViewsByCreator,
  getViewsLeaderboard,
  getViewsSummary,
  type ViewsSummary,
} from '@/lib/analytics'
import { getLeaderForCreator } from '@/lib/leaders'
import { getTeamMembers } from '@/lib/leader-portal'
import { getActivityForDay } from '@/lib/activity'
import { getTaskCalendar, getTaskChecksForDay, listLeaderTasks } from '@/lib/tasks'
import { REPOSTER_TABS, resolveReposterTab } from '@/lib/reposter-tabs'
import { addDays, calendarMonthRange } from '@/lib/campaign'
import { shiftYearMonth } from '@/lib/biweekly'
import { getLeagueBoard } from '@/lib/ranking'
import { CONTEST, isContestLive } from '@/lib/contest'
import { findMiyqatProject } from '@/lib/project-scope'
import { squadKeyFromName, squadLabel } from '@/lib/squads'
import { PLATFORMS, type Creator } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { formatNumber, formatWeekdayDate } from '@/lib/format'
import { createT, type Locale } from '@/lib/i18n'
import { getCreatorStrikeSummary } from '@/lib/strikes'
import { getReposterCheckDayCounts, getReposterChecksForDay } from '@/lib/reposter-checks'
import { timed } from '@/lib/ensure-once'
import { videoPaging } from '@/lib/video-page'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pickedAnalyticsRange(
  from: string | undefined,
  to: string | undefined,
  fallbackFrom: string,
  fallbackTo: string,
): { from: string; to: string } {
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
    return { from, to: to > fallbackTo ? fallbackTo : to }
  }
  return { from: fallbackFrom, to: fallbackTo }
}

function namedByHandle<T extends { creator_id: number; creator_name: string }>(
  rows: T[],
  handles: Map<number, { handle: string; role: 'creator' | 'reposter' }>,
): T[] {
  return rows.map((row) => ({
    ...row,
    creator_name: handles.get(row.creator_id)?.handle
      ? `@${handles.get(row.creator_id)!.handle}`
      : row.creator_name,
  }))
}

export async function ReposterDashboard({
  creator,
  username,
  locale,
  outreachWelcome,
  outreachHref,
  searchParams,
}: {
  creator: Creator
  username: string
  locale: Locale
  outreachWelcome?: string | null
  outreachHref?: string | null
  searchParams: {
    date?: string
    tab?: string
    panel?: string
    taskDay?: string
    u?: string
    vPage?: string
    vSize?: string
    cFrom?: string
    cTo?: string
    rFrom?: string
    rTo?: string
    videoDate?: string
    checkDate?: string
  }
}) {
  const t = createT(locale)
  const started = Date.now()
  const tab = resolveReposterTab(searchParams.tab, searchParams.panel)
  const [today, link] = await Promise.all([
    getServerToday(),
    getLeaderForCreator(creator.id).catch(() => null),
  ])
  const date = DATE_RE.test(searchParams.date ?? '') ? searchParams.date! : today
  const yesterday = addDays(today, -1)
  const checkDay =
    DATE_RE.test(searchParams.checkDate ?? '') && searchParams.checkDate! <= today
      ? searchParams.checkDate!
      : yesterday
  const videoDate =
    DATE_RE.test(searchParams.videoDate ?? '') && searchParams.videoDate! <= today
      ? searchParams.videoDate!
      : yesterday
  const taskDay = DATE_RE.test(searchParams.taskDay ?? '') ? searchParams.taskDay! : today
  const analyticsFrom = `${shiftYearMonth(today.slice(0, 7), -1)}-01`
  const analyticsTo = today
  const teamIds = link?.teamIds ?? []
  const videoIds = teamIds.length > 0 ? teamIds : [creator.id]
  const squadName = link ? squadLabel(squadKeyFromName(link.leaderName)) : null
  const needProjects = tab === 'upload' || tab === 'analytics'
  const needUploadMeta = tab === 'upload'
  const [defaultTime, projects, counts, active, strikeSummary] = await Promise.all([
    needUploadMeta ? getServerTimeHm() : Promise.resolve('12:00'),
    needProjects ? getAllProjects() : Promise.resolve([]),
    needUploadMeta
      ? getCreatorCountsByPlatformOnDate(creator.id, date).catch(() => ({
          instagram: 0,
          tiktok: 0,
          youtube: 0,
        }))
      : Promise.resolve({ instagram: 0, tiktok: 0, youtube: 0 }),
    needUploadMeta ? getActiveContract(creator.id, today).catch(() => null) : Promise.resolve(null),
    getCreatorStrikeSummary(creator.id, today).catch(() => null),
  ])
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

  const videosOpen = tab === 'today' && searchParams.panel === 'videos'
  const { page: vPage, pageSize: vSize, offset: vOffset } = videoPaging(searchParams)

  if (tab === 'today') {
    const checkMonth = calendarMonthRange(checkDay.slice(0, 7))
    const checkMonthEnd = checkMonth.end > today ? today : checkMonth.end
    const [progress, activityMarks, tasks, checked, calendar, handles, myChecks, groupSubs, videoStats, contractVideos, checkCounts] = await Promise.all([
      teamIds.length > 0
        ? timed('reposter-team-progress', () =>
            getCreatorsWithProgressOnDate(checkDay, undefined, 'creator', {
              creatorIds: teamIds,
            }),
          ).catch(() => [])
        : Promise.resolve([]),
      getActivityForDay(checkDay, videoIds).catch(() => ({})),
      link ? listLeaderTasks(link.leaderId, { today }).catch(() => []) : Promise.resolve([]),
      getTaskChecksForDay(creator.id, taskDay).catch(() => new Set<number>()),
      link ? getTaskCalendar(creator.id, link.leaderId, today).catch(() => []) : Promise.resolve([]),
      getLoginHandles(videoIds).catch(() => new Map()),
      getReposterChecksForDay(creator.id, checkDay).catch(() => new Set<number>()),
      videosOpen
        ? getAdminSubmissions({
            from: videoDate,
            to: videoDate,
            creatorIds: videoIds,
            role: 'creator',
            limit: vSize,
            offset: vOffset,
          }).catch(() => [])
        : Promise.resolve([]),
      getAdminSubmissionStats({ from: videoDate, to: videoDate, creatorIds: videoIds, role: 'creator' }).catch(() => ({
        count: 0,
        views: 0,
        creatorViews: 0,
      })),
      getTeamContractVideoProgress(teamIds, today).catch(
        () => new Map<number, ContractVideoProgress>(),
      ),
      getReposterCheckDayCounts(creator.id, checkMonth.start, checkMonthEnd).catch(() => ({})),
    ])
    const checkPeople = progress
      .filter((p) => p.role === 'creator' && !p.paused_at)
      .map((p) => {
        const any = p.today_instagram > 0 || p.today_tiktok > 0
        const igOk = p.goal_instagram <= 0 || p.today_instagram >= p.goal_instagram
        const ttOk = p.goal_tiktok <= 0 || p.today_tiktok >= p.goal_tiktok
        const status = igOk && ttOk && any ? 'hit' : any ? 'partial' : 'miss'
        return {
          id: p.id,
          handle: handles.get(p.id)?.handle || p.name,
          status: status as 'hit' | 'partial' | 'miss',
          todayInstagram: p.today_instagram,
          todayTiktok: p.today_tiktok,
          goalInstagram: p.goal_instagram,
          goalTiktok: p.goal_tiktok,
          checked: myChecks.has(p.id),
          contractInstagram: contractVideos.get(p.id)?.instagram ?? null,
          contractTiktok: contractVideos.get(p.id)?.tiktok ?? null,
          contractNeedInstagram: contractVideos.get(p.id)?.needInstagram ?? 0,
          contractNeedTiktok: contractVideos.get(p.id)?.needTiktok ?? 0,
          contractVideos: contractVideos.get(p.id)
            ? (contractVideos.get(p.id)!.instagram + contractVideos.get(p.id)!.tiktok)
            : p.total_videos,
        }
      })
    const ticked = tasks.filter((task) => checked.has(task.id)).length
    const creatorVideos = groupSubs.map((s) => ({
      id: s.id,
      handle: handles.get(s.creator_id)?.handle || s.creator_name,
      platform: s.platform,
      url: s.url,
      views: s.views ?? 0,
      projectName: s.project_name,
    }))
    panels.push(
      {
        id: 'check',
        title: t('leaderDailyCheck'),
        summary: `${checkPeople.filter((p) => p.checked).length}/${checkPeople.length}`,
        hint: formatWeekdayDate(checkDay, locale),
        children: (
          <ReposterDailyCheck
            people={checkPeople}
            day={checkDay}
            today={today}
            marks={activityMarks}
            checkCounts={checkCounts}
            actorUsername={username}
            locale={locale}
            labels={{
              hint: t('reposterDailyCheckHint'),
              empty: t('leaderNoPeople'),
              posted: t('leaderPosted'),
              partial: t('leaderPartial'),
              missed: t('leaderMissed'),
              break: t('leaderBreak'),
              off: t('leaderOff'),
              mark: t('leaderMark'),
              undo: t('leaderUndo'),
              comment: t('activityComment'),
              like: t('activityLike'),
              save: t('activitySave'),
              contract: t('contractVideos'),
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
        summary: `${videoStats.count}`,
        hint: videoDate,
        children: (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t('groupVideosHint')}</p>
              <VideoDaySwitch
                today={today}
                yesterday={yesterday}
                selected={videoDate}
                todayLabel={t('videoToday')}
                yesterdayLabel={t('videoYesterday')}
              />
              <DateSelect date={videoDate} param="videoDate" max={today} />
            </div>
            <RefreshViewsButton
              label={t('refreshViews')}
              defaultFrom={videoDate}
              defaultTo={videoDate}
              endpoint={`/api/reposter/${encodeURIComponent(username)}/refresh-views`}
              submissionIds={creatorVideos.map((video) => video.id)}
              showAll={false}
            />
            <GroupVideos videos={creatorVideos} emptyLabel={t('groupVideosEmpty')} />
            <VideoPager
              page={vPage}
              pageCount={Math.max(1, Math.ceil(videoStats.count / vSize))}
              total={videoStats.count}
              pageSize={vSize}
            />
          </div>
        ),
      },
    )
  }

  if (tab === 'analytics') {
    const handles = await getLoginHandles(videoIds.length > 0 ? videoIds : [creator.id]).catch(() => new Map())
    const creatorIds = [...handles.entries()].filter(([, row]) => row.role === 'creator').map(([id]) => id)
    const reposterIds = [...handles.entries()].filter(([, row]) => row.role === 'reposter').map(([id]) => id)
    if (!reposterIds.includes(creator.id)) reposterIds.push(creator.id)
    const creatorWindow = pickedAnalyticsRange(searchParams.cFrom, searchParams.cTo, analyticsFrom, analyticsTo)
    const reposterWindow = pickedAnalyticsRange(searchParams.rFrom, searchParams.rTo, analyticsFrom, analyticsTo)
    const creatorRange = {
      from: creatorWindow.from,
      to: creatorWindow.to,
      creatorIds,
    }
    const reposterRange = {
      from: reposterWindow.from,
      to: reposterWindow.to,
      creatorIds: reposterIds,
    }
    const emptySummary: ViewsSummary = {
      from: analyticsFrom,
      to: analyticsTo,
      creatorId: null,
      projectId: null,
      role: null,
      videos: 0,
      views: 0,
      videos_instagram: 0,
      videos_tiktok: 0,
      views_instagram: 0,
      views_tiktok: 0,
      zero_view_videos: 0,
    }
    const creatorsOpen = searchParams.panel !== 'analyticsReposters'
    const repostersOpen = searchParams.panel === 'analyticsReposters'
    const [
      dailyCreators,
      byCreatorDaily,
      creatorBoard,
      creatorSummary,
      dailyReposters,
      byReposterDaily,
      reposterBoard,
      reposterSummary,
      league,
      contestBoard,
    ] = await Promise.all([
      creatorsOpen ? getDailyAnalytics(creatorRange).catch(() => []) : Promise.resolve([]),
      creatorsOpen ? getDailyViewsByCreator(creatorRange).catch(() => []) : Promise.resolve([]),
      creatorsOpen ? getViewsLeaderboard({ ...creatorRange, limit: 40 }).catch(() => []) : Promise.resolve([]),
      getViewsSummary(creatorRange).catch(() => emptySummary),
      repostersOpen ? getDailyAnalytics(reposterRange).catch(() => []) : Promise.resolve([]),
      repostersOpen ? getDailyViewsByCreator(reposterRange).catch(() => []) : Promise.resolve([]),
      repostersOpen ? getViewsLeaderboard({ ...reposterRange, limit: 40 }).catch(() => []) : Promise.resolve([]),
      getViewsSummary(reposterRange).catch(() => emptySummary),
      getLeagueBoard({ role: 'reposter' }).catch(() => null),
      isContestLive(today) && miqatId != null
        ? getLeagueBoard({ role: 'reposter', from: CONTEST.from, to: CONTEST.to, projectId: miqatId }).catch(() => null)
        : Promise.resolve(null),
    ])
    const chartLabels = {
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
      firedNow: t('rankingFiredNow'),
    }
    panels.push(
      {
        id: 'analyticsCreators',
        title: t('analyticsCreators'),
        summary: formatNumber(creatorSummary.views),
        hint: `${creatorSummary.videos} ${t('videos')}`,
        children: (
          <div className="flex flex-col gap-4">
            <AnalyticsPanel
              daily={dailyCreators}
              byCreatorDaily={namedByHandle(byCreatorDaily, handles)}
              leaderboard={namedByHandle(creatorBoard, handles)}
              summary={creatorSummary}
              projects={projects}
              projectId={null}
              role="creator"
              today={today}
              defaultFrom={creatorWindow.from}
              defaultTo={creatorWindow.to}
              allowSheet={false}
              showRoleFilter={false}
              panelId="analyticsCreators"
              urlKeys={{ from: 'cFrom', to: 'cTo', role: 'cRole' }}
              labels={chartLabels}
            />
          </div>
        ),
      },
      {
        id: 'analyticsReposters',
        title: t('analyticsReposters'),
        summary: formatNumber(reposterSummary.views),
        hint: `${reposterSummary.videos} ${t('videos')}`,
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
                  firedNow: t('rankingFiredNow'),
                  views: t('views'),
                  videos: t('videosWord'),
                }}
              />
            ) : null}
            <AnalyticsPanel
              daily={dailyReposters}
              byCreatorDaily={namedByHandle(byReposterDaily, handles)}
              leaderboard={namedByHandle(reposterBoard, handles)}
              summary={reposterSummary}
              projects={projects}
              projectId={null}
              role="reposter"
              today={today}
              defaultFrom={reposterWindow.from}
              defaultTo={reposterWindow.to}
              allowSheet={false}
              showRoleFilter={false}
              panelId="analyticsReposters"
              urlKeys={{ from: 'rFrom', to: 'rTo', role: 'rRole' }}
              labels={chartLabels}
            />
          </div>
        ),
      },
    )
  }

  if (tab === 'team') {
    const members = await getTeamMembers(teamIds, today).catch(() => [])
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
            projects={
              creator.project_id != null
                ? projects.filter((p) => p.id === creator.project_id)
                : projects
            }
            defaultProjectId={creator.project_id}
            videoDate={date}
            defaultTime={defaultTime}
            brandProjects={brandProjects}
            maxDate={today}
            labels={{
              pasteLinks: t('pasteLinks'),
              pasteHint: t('pasteLinksHint'),
              send: t('submitVideos'),
              sendTo: t('submitVideosTo'),
              sending: t('sending'),
              project: t('submitProject'),
              projectHint: t('submitProjectHint'),
              projectFixed: t('submitProjectFixed'),
              pickProject: t('pickProject'),
              autoProject: t('autoProject'),
              postDate: t('postDate'),
              postTime: t('postTime'),
              postWhenHint: t('submitTimeHint'),
              dailyGoalLabel: t('submitDailyGoalLabel'),
              stepLinks: t('submitStepLinks'),
              stepWhen: t('submitStepWhen'),
              nowLabel: t('submitNowLabel'),
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
            : 'analyticsCreators'

  console.info(`[perf] reposter-dashboard tab=${tab} ${Date.now() - started}ms team=${teamIds.length}`)

  return (
    <ReposterShell
      locale={locale}
      username={username}
      displayName={username}
      squadName={squadName}
      welcome={outreachWelcome}
      outreachHref={outreachHref}
    >
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
