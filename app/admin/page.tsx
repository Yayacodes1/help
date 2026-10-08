import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import { ADMIN_TABS, resolveAdminTab } from '@/lib/admin-tabs'
import { AdminTabs } from '@/components/admin/admin-tabs'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  attachTracking,
  getAdminSubmissions,
  getAllPaidTotal,
  getAllProjects,
  getCreatorsWithProgressOnDate,
  getPaymentDueList,
  getPaymentsInRange,
  getPaymentsTotalInRange,
  getServerToday,
  getOperationalToday,
  type AdminFilters,
  type AdminSubmissionRow,
  type CreatorProgress,
} from '@/lib/queries'
import {
  defaultAnalyticsRange,
  getDailyAnalytics,
  getDailyDownloads,
  getDailySheet,
  getDailyViewsByCreator,
  getTopVideos,
  getViewsLeaderboard,
  getViewsSummary,
} from '@/lib/analytics'
import { monthRange, parseYearMonth, rankingMonthRange } from '@/lib/campaign'
import { ensureMarketingTables, listMarketingRequests } from '@/lib/marketing'
import { StatCard } from '@/components/stat-card'
import { FiltersBar } from '@/components/admin/filters-bar'
import { ProjectsManager } from '@/components/admin/projects-manager'
import { CreatorsManager } from '@/components/admin/creators-manager'
import { ProjectSelector } from '@/components/admin/project-selector'
import { RoleSelector } from '@/components/admin/role-selector'
import { TodayProgress } from '@/components/admin/today-progress'
import { DayNavigator } from '@/components/admin/day-navigator'
import { LogoutButton } from '@/components/admin/logout-button'
import { AttentionBoard } from '@/components/admin/attention-board'
import { PanelBoard } from '@/components/admin/panel-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { PaymentsPeriodPanel } from '@/components/admin/payments-period-panel'
import { PaymentDuePanel } from '@/components/admin/payment-due-panel'
import { AssistantChat } from '@/components/admin/assistant-chat'
import { AssistantDrawer } from '@/components/admin/assistant-drawer'
import { AnalyticsPanel } from '@/components/admin/analytics-panel'
import { AnalyticsSheet } from '@/components/admin/analytics-sheet'
import { revenueCatLinks } from '@/lib/revenuecat'
import { TopVideosPanel } from '@/components/admin/top-videos-panel'
import { WalletBoard } from '@/components/marketing/wallet-board'
import { getPayablePeople, getWalletEntries, getWalletTotals } from '@/lib/wallet'
import { OutflowPanel } from '@/components/admin/outflow-panel'
import { PayCadences } from '@/components/admin/pay-cadence'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { LanguageToggle } from '@/components/language-toggle'
import { CreatorJumpSearch } from '@/components/admin/creator-jump-search'
import { formatDate, formatMoney, formatNumber, formatYearMonth, payCurrency } from '@/lib/format'
import { getOutflowSnapshot, type OutflowView } from '@/lib/outflow'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import type { Platform, Project } from '@/lib/db'
import { parseRoleFilter, roleFilterToSql } from '@/lib/participant-role'
import { getLeagueBoard } from '@/lib/ranking'
import { RankingBoard } from '@/components/ranking-board'
import { RankingFilters } from '@/components/admin/ranking-filters'
import { StrikesPanel } from '@/components/admin/strikes-panel'
import { ContractReviewsPanel } from '@/components/admin/contract-reviews-panel'
import { getPendingContractReviews } from '@/lib/contract-reviews'
import { getReposterStrikeBoard, syncReposterStrikes } from '@/lib/strikes'
import { getAttendanceForDay } from '@/lib/attendance'
import { getProjectViewsBoard } from '@/lib/project-views'
import { ProjectViewsPanel } from '@/components/admin/project-views-panel'
import { getCommissionBoard, getCommissionEstimate } from '@/lib/commission-data'
import { CommissionBoardPanel } from '@/components/admin/commission-board'
import {
  SPLIT_PROJECT_VALUE,
  findProjectById,
  isMiyqatProjectName,
  sideRoleKey,
  splitProjectPair,
} from '@/lib/project-scope'
import type { AttendancePerson } from '@/lib/attendance'
import { SplitColumns } from '@/components/admin/split-columns'
import { SideRoleToggle } from '@/components/admin/side-role-toggle'
import { TeamGoalsBoard } from '@/components/admin/team-goals-board'
import { getTeamCounts, getTeamGoals } from '@/lib/team-goals'
import { CONTEST } from '@/lib/contest'
import { MiqatContestPanel } from '@/components/admin/miqat-contest-panel'

export const dynamic = 'force-dynamic'

const PLATFORM_SET = new Set<Platform>(['instagram', 'tiktok'])

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string
    role?: string
    creator?: string
    platform?: string
    from?: string
    to?: string
    day?: string
    panel?: string
    tab?: string
    payFrom?: string
    payTo?: string
    aFrom?: string
    aTo?: string
    aCreator?: string
    aProject?: string
    aRole?: string
    aSheet?: string
    tvFrom?: string
    tvTo?: string
    tvPlatform?: string
    ofFrom?: string
    ofTo?: string
    ofView?: string
    pvFrom?: string
    pvTo?: string
    pvKind?: string
    pvMode?: string
    pvPerson?: string
    rankMonth?: string
    rankProject?: string
    rankRole?: string
    cmFrom?: string
    cmTo?: string
    cmContract?: string
    /** Side by side: `role<projectId>`, `aFrom<projectId>`, `aTo<projectId>`. */
    [key: string]: string | undefined
  }>
}) {
  if (!(await isAdmin())) redirect('/login')
  await ensureCreatorTrackingColumns()
  await ensureMarketingTables()

  const locale = await getLocale()
  const t = createT(locale)

  const sp = await searchParams
  const platform =
    sp.platform && PLATFORM_SET.has(sp.platform as Platform)
      ? (sp.platform as Platform)
      : undefined
  const today = await getServerToday()
  const opToday = await getOperationalToday()
  await syncReposterStrikes({ today: opToday })
  const { start: monthStart, end: monthEnd } = monthRange(today)
  const analyticsDefault = defaultAnalyticsRange(today)

  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? '') ? sp.day! : today
  const isToday = selectedDay === today

  const projectRaw = Number(sp.project)
  const projectId =
    sp.project && sp.project !== SPLIT_PROJECT_VALUE && Number.isFinite(projectRaw) ? projectRaw : undefined
  // Default view: Notek | Miqat side by side; picking one project narrows it.
  const splitRequested = projectId == null
  const roleParam = sp.role ?? 'creator'
  const roleFilter = parseRoleFilter(roleParam)
  const roleSql = roleFilterToSql(roleFilter)

  const filters: AdminFilters = {
    projectId,
    role: roleSql,
    creatorId: sp.creator ? Number(sp.creator) : undefined,
    platform,
    from: sp.from || monthStart,
    to: sp.to || monthEnd,
  }

  const payFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.payFrom ?? '') ? sp.payFrom! : monthStart
  const payTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.payTo ?? '') ? sp.payTo! : monthEnd

  const aFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.aFrom ?? '')
    ? sp.aFrom!
    : analyticsDefault.from
  const aTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.aTo ?? '') ? sp.aTo! : analyticsDefault.to
  const aProjectRaw = Number(sp.aProject)
  const aProjectId =
    sp.aProject === 'all'
      ? null
      : Number.isFinite(aProjectRaw) && aProjectRaw > 0
        ? aProjectRaw
        : projectId != null && Number.isFinite(projectId)
          ? projectId
          : null
  const aRoleFilter = parseRoleFilter(
    sp.aRole === 'creator' || sp.aRole === 'reposter' || sp.aRole === 'all'
      ? sp.aRole
      : roleParam,
  )
  const aRoleSql = roleFilterToSql(aRoleFilter)

  const tvFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.tvFrom ?? '')
    ? sp.tvFrom!
    : monthStart
  const tvTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.tvTo ?? '') ? sp.tvTo! : monthEnd
  const tvPlatform =
    sp.tvPlatform === 'instagram' || sp.tvPlatform === 'tiktok' ? sp.tvPlatform : null

  const ofFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.ofFrom ?? '') ? sp.ofFrom! : monthStart
  const ofTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.ofTo ?? '') ? sp.ofTo! : monthEnd
  const ofView: OutflowView =
    sp.ofView === 'creators' || sp.ofView === 'reposters' || sp.ofView === 'total'
      ? sp.ofView
      : 'reposters'

  const pvFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.pvFrom ?? '')
    ? sp.pvFrom!
    : analyticsDefault.from
  const pvTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.pvTo ?? '') ? sp.pvTo! : analyticsDefault.to
  const pvKind = parseRoleFilter(
    sp.pvKind === 'creator' || sp.pvKind === 'reposter' || sp.pvKind === 'all'
      ? sp.pvKind
      : roleParam,
  )
  const pvKindSql = roleFilterToSql(pvKind)
  const pvPersonId = sp.pvPerson ? Number(sp.pvPerson) : null
  const pvCreatorId = pvPersonId != null && Number.isFinite(pvPersonId) ? pvPersonId : null

  const rankMonth = parseYearMonth(sp.rankMonth, today)
  const { start: rankFrom, end: rankTo } = rankingMonthRange(rankMonth, today)
  // Ranking follows the header project filter (Miyqat / Notek / all).
  const rankProjectId = projectId != null && Number.isFinite(projectId) ? projectId : null
  const rankRole =
    sp.rankRole === 'creator' || sp.rankRole === 'reposter' || sp.rankRole === 'all'
      ? sp.rankRole
      : roleFilter
  const rankRoleSql = roleFilterToSql(rankRole)

  const cmFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.cmFrom ?? '') ? sp.cmFrom! : monthStart
  const cmTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.cmTo ?? '') ? sp.cmTo! : monthEnd
  const cmContractRaw = Number(sp.cmContract)
  const cmContractId =
    Number.isFinite(cmContractRaw) && cmContractRaw > 0 ? cmContractRaw : null

  const projectsEarly = await getAllProjects()
  const selectedProject = findProjectById(projectsEarly, projectId ?? null)
  const miyqatScope = selectedProject != null && isMiyqatProjectName(selectedProject.name)
  const includeAllReposters = projectId != null
  const includeAllCreators = miyqatScope

  const tab = resolveAdminTab(sp.tab, sp.panel)
  const session = await getAdminSession()
  const showBusiness = session?.role === 'owner'
  const projects = projectsEarly

  const creatorsBase = await getCreatorsWithProgressOnDate(selectedDay, projectId, roleSql, {
    includeAllReposters,
    includeAllCreators,
  })
  const activeBase = creatorsBase.filter((c) => !c.paused_at)

  async function loadToday() {
    const [submissions, strikeBoard, attendance, contractReviews] = await Promise.all([
      getAdminSubmissions(filters),
      getReposterStrikeBoard(opToday),
      getAttendanceForDay(selectedDay),
      getPendingContractReviews(),
    ])
    return { submissions, strikeBoard, attendance, contractReviews }
  }

  async function loadAnalytics() {
    const sheetOpen = sp.aSheet === '1'
    const [
      dailyAnalytics,
      byCreatorDaily,
      leaderboard,
      viewsSummary,
      topVideos,
      league,
      contestBoard,
      projectViews,
      projectViewVideos,
      sheetRows,
      sheetDownloads,
    ] = await Promise.all([
      getDailyAnalytics({ from: aFrom, to: aTo, projectId: aProjectId, role: aRoleSql }),
      getDailyViewsByCreator({ from: aFrom, to: aTo, projectId: aProjectId, role: aRoleSql }),
      getViewsLeaderboard({
        from: aFrom,
        to: aTo,
        projectId: aProjectId,
        role: aRoleSql,
        limit: 1000,
      }),
      getViewsSummary({ from: aFrom, to: aTo, projectId: aProjectId, role: aRoleSql }),
      getTopVideos({
        from: tvFrom,
        to: tvTo,
        projectId: projectId ?? null,
        role: roleSql,
        platform: tvPlatform,
        limit: 50,
      }),
      getLeagueBoard({ from: rankFrom, to: rankTo, projectId: rankProjectId, role: rankRoleSql }),
      getLeagueBoard({
        from: CONTEST.from,
        to: CONTEST.to,
        projectId: null,
        role: 'reposter',
      }),
      getProjectViewsBoard({
        from: pvFrom,
        to: pvTo,
        role: pvKindSql,
        projectId: projectId ?? null,
        includeAllPeople: miyqatScope,
      }),
      pvCreatorId != null
        ? getAdminSubmissions({
            creatorId: pvCreatorId,
            role: pvKindSql,
            projectId,
            from: pvFrom,
            to: pvTo,
          })
        : Promise.resolve([]),
      sheetOpen
        ? getDailySheet({ from: aFrom, to: aTo, projectId: aProjectId })
        : Promise.resolve([]),
      sheetOpen && showBusiness
        ? getDailyDownloads({ from: aFrom, to: aTo, projectId: aProjectId })
        : Promise.resolve([]),
    ])
    return {
      sheetOpen,
      dailyAnalytics,
      byCreatorDaily,
      leaderboard,
      viewsSummary,
      topVideos,
      league,
      contestBoard,
      projectViews,
      projectViewVideos,
      sheetRows,
      sheetDownloads,
    }
  }

  async function loadMoney() {
    const [
      periodPayments,
      periodTotal,
      paidAllTime,
      payDueRows,
      walletTotals,
      walletEntries,
      walletPeople,
      walletDue,
      marketingRequests,
      outflow,
      commissionBoard,
      commissionEstimate,
    ] = await Promise.all([
      getPaymentsInRange(payFrom, payTo, undefined, roleSql),
      getPaymentsTotalInRange(payFrom, payTo, undefined, roleSql),
      getAllPaidTotal(projectId, roleSql),
      getPaymentDueList(today, projectId, roleSql),
      getWalletTotals(),
      getWalletEntries(),
      getPayablePeople(),
      projectId == null && roleSql == null
        ? Promise.resolve(null)
        : getPaymentDueList(today, undefined, null),
      listMarketingRequests(null, null),
      getOutflowSnapshot({
        from: ofFrom,
        to: ofTo,
        view: ofView,
        countMode: 'base',
        projectId: projectId ?? null,
        includeAllCreators,
        includeAllReposters,
      }),
      getCommissionBoard({ from: cmFrom, to: cmTo, today, projectId: projectId ?? null, role: roleSql }),
      getCommissionEstimate({
        today,
        projectId: projectId ?? null,
        role: roleSql,
        contractId: cmContractId,
      }),
    ])
    return {
      periodPayments,
      periodTotal,
      paidAllTime,
      payDueRows,
      walletTotals,
      walletEntries,
      walletPeople,
      walletDue: walletDue ?? payDueRows,
      marketingRequests,
      outflow,
      commissionBoard,
      commissionEstimate,
    }
  }

  // Each tab loads only its own data; these are read only inside that tab's panels.
  const todayData = tab === 'today' ? await loadToday() : null
  const analyticsData = tab === 'analytics' ? await loadAnalytics() : null
  const moneyData = tab === 'money' ? await loadMoney() : null
  const { submissions, strikeBoard, attendance, contractReviews } =
    todayData ?? ({} as Awaited<ReturnType<typeof loadToday>>)
  const {
    sheetOpen,
    dailyAnalytics,
    byCreatorDaily,
    leaderboard,
    viewsSummary,
    topVideos,
    league,
    contestBoard,
    projectViews,
    projectViewVideos,
    sheetRows,
    sheetDownloads,
  } = analyticsData ?? ({} as Awaited<ReturnType<typeof loadAnalytics>>)
  const {
    periodPayments,
    periodTotal,
    paidAllTime,
    payDueRows,
    walletTotals,
    walletEntries,
    walletPeople,
    walletDue,
    marketingRequests,
    outflow,
    commissionBoard,
    commissionEstimate,
  } = moneyData ?? ({} as Awaited<ReturnType<typeof loadMoney>>)

  const pvModeRaw = sp.pvMode
  const pvMode: 'combined' | number =
    projectId != null && Number.isFinite(projectId)
      ? projectId
      : pvModeRaw &&
          pvModeRaw !== 'combined' &&
          projectViews?.projects.some((p) => String(p.id) === pvModeRaw)
        ? Number(pvModeRaw)
        : 'combined'
  const projectViewsHint = (projectViews?.projects ?? [])
    .slice(0, 2)
    .map((p) => `${p.name} ${formatNumber(projectViews.totals.viewsByProject[p.id] ?? 0)}`)
    .join(' · ')

  const everyone =
    tab === 'today' || tab === 'people' ? await attachTracking(creatorsBase, today) : []

  // Notek | Miqat side by side: same panels, one column per project.
  const splitProjects = splitRequested ? splitProjectPair(projects) : []
  const trackedById = new Map(everyone.map((c) => [c.id, c]))

  async function loadSplitSide(project: Project) {
    const pid = project.id
    const wantsPeople = tab === 'today' || tab === 'people'
    // Each column keeps its own filters; picking one on Miqat leaves Notek alone.
    const role = parseRoleFilter(sp[sideRoleKey(pid)] ?? roleParam)
    const sideRoleSql = roleFilterToSql(role)
    const sideFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp[`aFrom${pid}`] ?? '') ? sp[`aFrom${pid}`]! : aFrom
    const sideTo = /^\d{4}-\d{2}-\d{2}$/.test(sp[`aTo${pid}`] ?? '') ? sp[`aTo${pid}`]! : aTo
    const range = { from: sideFrom, to: sideTo, projectId: pid, role: sideRoleSql }
    const [base, sideAttendance, sideSubmissions, sideAnalytics] = await Promise.all([
      wantsPeople
        ? getCreatorsWithProgressOnDate(selectedDay, pid, sideRoleSql, { projectMembersOnly: true })
        : Promise.resolve([] as CreatorProgress[]),
      tab === 'today'
        ? getAttendanceForDay(selectedDay, pid)
        : Promise.resolve([] as AttendancePerson[]),
      tab === 'today'
        ? getAdminSubmissions({ ...filters, projectId: pid, role: sideRoleSql })
        : Promise.resolve([] as AdminSubmissionRow[]),
      tab === 'analytics'
        ? Promise.all([
            getDailyAnalytics(range),
            getDailyViewsByCreator(range),
            getViewsLeaderboard({ ...range, limit: 1000 }),
            getViewsSummary(range),
          ]).then(([daily, byCreatorDaily, leaderboard, summary]) => ({
            daily,
            byCreatorDaily,
            leaderboard,
            summary,
          }))
        : Promise.resolve(null),
    ])
    // Tracking (goals, streaks, pay) is per person; only today's counts are per project.
    const tracked = base.flatMap((c) => {
      const row = trackedById.get(c.id)
      return row
        ? [
            {
              ...row,
              today_instagram: c.today_instagram,
              today_tiktok: c.today_tiktok,
              total_videos: c.total_videos,
            },
          ]
        : []
    })
    const active = tracked.filter((c) => !c.paused_at)
    const ids = new Set(base.map((c) => c.id))
    const attention = sideAttendance.filter((p) => {
      if (!ids.has(p.id)) return false
      if (role === 'creator' || role === 'reposter') return p.role === role
      return true
    })
    return {
      project,
      role,
      analyticsFrom: sideFrom,
      analyticsTo: sideTo,
      creators: active,
      paused: tracked.filter((c) => c.paused_at),
      postedPeople: active.filter((c) => c.today_instagram + c.today_tiktok > 0).length,
      attention,
      attentionCount: attention.filter((p) => p.status === 'miss' || p.status === 'partial').length,
      submissions: sideSubmissions,
      views: sideSubmissions.reduce((sum, v) => sum + (v.views ?? 0), 0),
      analytics: sideAnalytics,
    }
  }

  const splitData =
    splitProjects.length === 2 ? await Promise.all(splitProjects.map(loadSplitSide)) : null
  const teamProjects = selectedProject ? [selectedProject] : splitProjects.length === 2 ? splitProjects : projects
  const [teamCounts, teamGoals] =
    tab === 'people'
      ? await Promise.all([getTeamCounts(teamProjects, selectedDay), getTeamGoals()])
      : [[], []]
  const splitSummary = (part: (side: NonNullable<typeof splitData>[number]) => string) =>
    (splitData ?? []).map((side) => `${side.project.name} ${part(side)}`).join(' · ')
  const sideControls = (side: NonNullable<typeof splitData>[number]) => (
    <SideRoleToggle
      projectId={side.project.id}
      value={side.role}
      labels={{
        all: t('roleFilterAll'),
        creators: t('roleFilterCreators'),
        reposters: t('roleFilterReposters'),
      }}
    />
  )
  const creators = everyone.filter((c) => !c.paused_at)
  const pausedCreators = everyone.filter((c) => c.paused_at)
  const creatorIds = new Set(creatorsBase.map((c) => c.id))
  const attendancePeople = (attendance ?? []).filter((p) => {
    if (!creatorIds.has(p.id)) return false
    if (roleFilter === 'creator' || roleFilter === 'reposter') return p.role === roleFilter
    return true
  })
  const attentionCount = attendancePeople.filter(
    (p) => p.status === 'miss' || p.status === 'partial',
  ).length
  const openMarketingRequests = (marketingRequests ?? []).filter((r) => r.status === 'open').length
  const walletLeft = walletTotals?.find((w) => w.currency === 'USD')?.left ?? 0

  const totalViews = (submissions ?? []).reduce((sum, s) => sum + (s.views ?? 0), 0)
  const creatorViews = (submissions ?? []).reduce(
    (sum, s) => sum + (s.creator_role === 'reposter' ? 0 : s.views ?? 0),
    0,
  )
  const reposterViews = totalViews - creatorViews
  const totalVideos = submissions?.length ?? 0

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
  const payDueCount = payDueRows?.due.length ?? 0

  const peopleNoun =
    roleFilter === 'reposter'
      ? t('reposters')
      : roleFilter === 'all'
        ? t('people')
        : t('creators')
  const activeTodayLabel =
    roleFilter === 'reposter'
      ? isToday
        ? t('repostersActiveToday')
        : t('repostersActiveThatDay')
      : roleFilter === 'all'
        ? isToday
          ? t('peopleActiveToday')
          : t('peopleActiveThatDay')
        : isToday
          ? t('creatorsActiveToday')
          : t('creatorsActiveThatDay')

  const analyticsLabels = {
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
      aRoleFilter === 'reposter'
        ? t('topReposters')
        : aRoleFilter === 'all'
          ? t('topPeople')
          : t('topCreators'),
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
  }

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

  const tabPanels: readonly string[] = ADMIN_TABS[tab]
  const defaultPanel =
    sp.panel && tabPanels.includes(sp.panel)
      ? sp.panel
      : tab === 'people'
        ? 'manage'
        : null

  return (
    <main
      className={`mx-auto flex min-h-dvh w-full flex-col px-5 py-8 ${
        splitData ? 'max-w-[96rem]' : 'max-w-6xl'
      }`}
    >
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {session ? (
              <p className="text-sm text-muted-foreground">
                {t('hey')} {session.name}
              </p>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight">{t('adminDashboard')}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle
              locale={locale}
              labels={{ english: t('english'), arabic: t('arabic') }}
            />
            <RoleSelector
              labels={{
                creators: t('roleFilterCreators'),
                reposters: t('roleFilterReposters'),
                all: t('roleFilterAll'),
              }}
            />
            <ProjectSelector projects={projects} />
            <LogoutButton label={t('logOut')} />
          </div>
        </div>
        <CreatorJumpSearch
          people={activeBase.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            tiktok_username: c.tiktok_username,
            instagram_username: c.instagram_username,
          }))}
          roleFilter={roleFilter}
          projectId={projectId}
          placeholder={t('jumpSearchPlaceholder')}
          hint={t('jumpSearchHint')}
        />
        <AdminTabs
          active={tab}
          labels={{
            today: t('tabToday'),
            analytics: t('tabAnalytics'),
            money: t('tabMoney'),
            people: t('tabPeople'),
          }}
        />
      </header>

      {tab === 'today' && (
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={isToday ? t('postedToday') : t('postedThatDay')}
          value={`${postedTodayTotal} / ${goalTotal}`}
        />
        <StatCard
          label={activeTodayLabel}
          value={`${creatorsPostedToday} / ${creators.length}`}
        />
        <StatCard
          label={t('totalViews')}
          value={formatNumber(totalViews)}
          hint={
            roleFilter === 'all'
              ? `${t('creators')} ${formatNumber(creatorViews)} · ${t('reposters')} ${formatNumber(reposterViews)}`
              : undefined
          }
        />
        <StatCard
          label={t('strikesTitle')}
          value={strikeBoard.withContractStrikes}
          hint={`${strikeBoard.missingToday} ${t('strikesMissingToday')} · ${strikeBoard.needsCorrective} ${t('strikesCorrective')}`}
        />
      </section>
      )}

      {tab === 'people' ? <TeamGoalsBoard counts={teamCounts} goals={teamGoals} today={today} /> : null}

      <p className="mt-6 mb-3 text-xs text-muted-foreground">{t('tapSection')}</p>

      <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
      <PanelBoard
        defaultOpen={defaultPanel}
        columns={3}
        closeLabel={t('close')}
        panels={[
          ...(analyticsData ? [
          {
            id: 'analytics',
            title: t('analytics'),
            summary: formatNumber(viewsSummary.views),
            hint: `${viewsSummary.videos} ${t('videos')} · ${aFrom.slice(5)}→${aTo.slice(5)}`,
            children: splitData ? (
              <SplitColumns
                sides={splitData.map((side) => ({
                  key: side.project.id,
                  title: side.project.name,
                  summary: side.analytics
                    ? `${formatNumber(side.analytics.summary.views)} ${t('views')} · ${side.analytics.summary.videos} ${t('videos')}`
                    : undefined,
                  children: side.analytics ? (
                    <AnalyticsPanel
                      sideBySide
                      daily={side.analytics.daily}
                      byCreatorDaily={side.analytics.byCreatorDaily}
                      leaderboard={side.analytics.leaderboard}
                      summary={side.analytics.summary}
                      projects={projects}
                      projectId={side.project.id}
                      role={side.role}
                      today={today}
                      defaultFrom={side.analyticsFrom}
                      defaultTo={side.analyticsTo}
                      labels={analyticsLabels}
                      urlKeys={{
                        from: `aFrom${side.project.id}`,
                        to: `aTo${side.project.id}`,
                        role: sideRoleKey(side.project.id),
                      }}
                    />
                  ) : null,
                }))}
              />
            ) : (
              <AnalyticsPanel
                daily={dailyAnalytics}
                byCreatorDaily={byCreatorDaily}
                leaderboard={leaderboard}
                summary={viewsSummary}
                projects={projects}
                projectId={aProjectId}
                role={aRoleFilter}
                today={today}
                defaultFrom={aFrom}
                defaultTo={aTo}
                labels={analyticsLabels}
              />
            ),
          },
          {
            id: 'miqatcontest',
            title: t('contestDashboard'),
            summary: contestBoard?.rows[0]
              ? formatNumber(contestBoard.rows[0].views)
              : '0',
            hint: `${CONTEST.from.slice(5)}→${CONTEST.to.slice(5)} · ${projects.map((p) => p.name).join(' + ')}`,
            children: (
              <MiqatContestPanel
                board={contestBoard}
                labels={{
                  title: t('contestDashboard'),
                  empty: t('contestBoardEmpty'),
                  noProject: t('contestNoProject'),
                  both: t('contestBoth'),
                  instagram: t('instagram'),
                  tiktok: t('tiktok'),
                  views: t('views'),
                  videos: t('videos'),
                  rank: t('rankingRank'),
                  prize: t('contestPrize'),
                  diamond: t('contestDiamond'),
                  gold: t('contestGold'),
                  silver: t('contestSilver'),
                }}
              />
            ),
          },
          {
            id: 'ranking',
            title: t('rankingTitle'),
            summary: league.rows[0] ? formatNumber(league.rows[0].views) : '0',
            hint: `${league.rows.filter((r) => r.views > 0).length} ranked · ${formatYearMonth(rankMonth, locale)}`,
            children: (
              <div className="flex flex-col gap-4">
                <RankingFilters
                  today={today}
                  month={rankMonth}
                  projectId={rankProjectId}
                  role={rankRole}
                  projects={projects}
                  labels={{
                    thisMonth: t('rankingThisMonth'),
                    lastMonth: t('rankingLastMonth'),
                    month: t('rankingMonth'),
                    allProjects: t('projectViewsCombined'),
                    creators: t('roleFilterCreators'),
                    reposters: t('roleFilterReposters'),
                    all: t('roleFilterAll'),
                    kind: t('projectViewsKind'),
                  }}
                />
                <RankingBoard
                  board={league}
                  collapsedLimit={null}
                  identity="given"
                  showRole={rankRole === 'all'}
                  periodLabel={formatYearMonth(rankMonth, locale)}
                  labels={{
                    title: t('rankingTitle'),
                    empty: t('rankingEmpty'),
                    expand: t('rankingExpand'),
                    collapse: t('rankingCollapse'),
                    search: t('rankingSearch'),
                    rank: t('rankingRank'),
                    views: t('views'),
                    videos: t('videosWord'),
                    creatorRole: t('creatorRole'),
                    reposterRole: t('reposterRole'),
                  }}
                />
              </div>
            ),
          },
          {
            id: 'projectviews',
            title: t('projectViews'),
            summary: formatNumber(projectViews.totals.views),
            hint: projectViewsHint || `${projectViews.totals.videos} ${t('videos')}`,
            children: (
              <ProjectViewsPanel
                board={projectViews}
                submissions={projectViewVideos}
                selectedCreatorId={pvCreatorId}
                mode={pvMode}
                kind={pvKind}
                projectId={projectId}
                today={today}
                defaultFrom={pvFrom}
                defaultTo={pvTo}
                labels={{
                  from: t('from'),
                  to: t('to'),
                  apply: t('apply'),
                  empty: t('projectViewsEmpty'),
                  views: t('views'),
                  videos: t('videosWord'),
                  combined: t('projectViewsCombined'),
                  kind: t('projectViewsKind'),
                  creators: t('roleFilterCreators'),
                  reposters: t('roleFilterReposters'),
                  all: t('roleFilterAll'),
                  person: t('projectViewsPerson'),
                  everyone: t('projectViewsEveryone'),
                  extractCopy: t('projectViewsCopy'),
                  extractCopied: t('projectViewsCopied'),
                  extractCsv: t('projectViewsCsv'),
                  changeHint: t('projectViewsChangeHint'),
                  noProject: t('noProject'),
                  creatorRole: t('creatorRole'),
                  reposterRole: t('reposterRole'),
                  instagram: t('instagram'),
                  tiktok: t('tiktok'),
                  search: t('projectViewsSearch'),
                  noVideosMatch: t('noVideosMatch'),
                  allProjects: t('allProjects'),
                  chooseProject: t('chooseProject'),
                }}
              />
            ),
          },
          {
            id: 'topvideos',
            title: 'Top videos',
            summary: topVideos[0] ? formatNumber(topVideos[0].views) : '0',
            hint: `${topVideos.length} ranked · ${tvFrom.slice(5)}→${tvTo.slice(5)}`,
            children: (
              <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
                <TopVideosPanel
                  videos={topVideos}
                  projects={projects}
                  projectId={projectId}
                  today={today}
                  defaultFrom={tvFrom}
                  defaultTo={tvTo}
                  labels={{
                    allProjects: t('allProjects'),
                    chooseProject: t('chooseProject'),
                  }}
                />
              </Suspense>
            ),
          },
          ] : []),
          ...(todayData ? [
          {
            id: 'progress',
            title: isToday ? t('todaysProgress') : t('dailyProgress'),
            summary: splitData
              ? splitSummary((side) => `${side.postedPeople}/${side.creators.length}`)
              : `${creatorsPostedToday}/${creators.length} ${t('active')}`,
            hint: isToday ? t('goalsForToday') : formatDate(selectedDay),
            children: (
              <div className="flex flex-col gap-3">
                <DayNavigator selectedDay={selectedDay} today={today} />
                {splitData ? (
                  <SplitColumns
                    sides={splitData.map((side) => ({
                      key: side.project.id,
                      title: side.project.name,
                      summary: `${side.postedPeople}/${side.creators.length} ${t('active')}`,
                      controls: sideControls(side),
                      children: (
                        <TodayProgress
                          creators={side.creators}
                          linkRole={side.role}
                          projectId={projectId}
                        />
                      ),
                    }))}
                  />
                ) : (
                  <TodayProgress
                    creators={creators}
                    linkRole={roleFilter}
                    projectId={projectId}
                  />
                )}
              </div>
            ),
          },
          {
            id: 'reviews',
            title: t('reviewsTitle'),
            summary: contractReviews.length === 0 ? t('allClear') : `${contractReviews.length}`,
            hint: t('reviewsSummaryHint'),
            children: (
              <ContractReviewsPanel
                reviews={contractReviews}
                projectId={projectId}
                labels={{
                  hint: t('reviewsHint'),
                  empty: t('reviewsEmpty'),
                  reviewed: t('reviewsDone'),
                  reviewedAll: t('reviewsDoneAll'),
                  week: t('reviewsWeek'),
                }}
              />
            ),
          },
          {
            id: 'strikes',
            title: t('strikesTitle'),
            summary: `${strikeBoard.withContractStrikes}`,
            hint: `${strikeBoard.missingToday} ${t('strikesMissingToday')}`,
            children: (
              <StrikesPanel
                board={strikeBoard}
                labels={{
                  hint: t('strikesHint'),
                  missingToday: t('strikesMissingToday'),
                  thisContract: t('strikesThisContract'),
                  corrective: t('strikesCorrective'),
                  person: t('projectViewsPerson'),
                  strikes: t('strikeCount'),
                  today: t('today'),
                  posted: t('strikePostedToday'),
                  missed: t('strikeMissedToday'),
                  lastStrike: t('strikeLast'),
                  add: t('strikeAdd'),
                  take: t('strikeTake'),
                  empty: t('strikeNoReposters'),
                  noContract: t('noContractSet'),
                  correctiveFlag: t('strikesCorrectiveFlag'),
                  resetOne: t('strikeResetOne'),
                  resetAll: t('strikeResetAll'),
                  giveBreak: t('strikeGiveBreak'),
                  breakStart: t('strikeBreakStart'),
                  breakDays: t('strikeBreakDays'),
                  breakReason: t('strikeBreakReason'),
                  maxStrikes: t('strikeMax'),
                  onBreak: t('strikeOnBreak'),
                  saveMax: t('strikeSaveMax'),
                }}
              />
            ),
          },
          {
            id: 'attention',
            title: t('needsAttention'),
            summary: splitData
              ? splitSummary((side) => `${side.attentionCount}`)
              : attentionCount === 0
                ? t('allClear')
                : `${attentionCount} ${t('behind')}`,
            hint: isToday ? t('today') : formatDate(selectedDay),
            children: splitData ? (
              <SplitColumns
                sides={splitData.map((side) => ({
                  key: side.project.id,
                  title: side.project.name,
                  summary:
                    side.attentionCount === 0
                      ? t('allClear')
                      : `${side.attentionCount} ${t('behind')}`,
                  controls: sideControls(side),
                  children: (
                    <AttentionBoard
                      people={side.attention}
                      selectedDay={selectedDay}
                      today={today}
                      dayLabel={isToday ? t('today') : formatDate(selectedDay)}
                      linkRole={side.role}
                      projectId={projectId}
                      labels={attentionLabels}
                    />
                  ),
                }))}
              />
            ) : (
              <AttentionBoard
                people={attendancePeople}
                selectedDay={selectedDay}
                today={today}
                dayLabel={isToday ? t('today') : formatDate(selectedDay)}
                linkRole={roleFilter}
                projectId={projectId}
                labels={attentionLabels}
              />
            ),
          },
          {
            id: 'videos',
            title: t('videos'),
            summary: splitData
              ? splitSummary((side) => `${side.submissions.length}`)
              : `${totalVideos}`,
            hint: `${formatNumber(totalViews)} ${t('views')}`,
            children: (
              <div className="flex flex-col gap-3">
                <FiltersBar
                  creators={everyone}
                  projects={projects}
                  projectId={projectId}
                  today={today}
                  defaultFrom={monthStart}
                  defaultTo={monthEnd}
                  labels={{
                    allProjects: t('allProjects'),
                    chooseProject: t('chooseProject'),
                  }}
                />
                {miyqatScope && roleFilter === 'creator' && submissions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {t('miqatRoleHint')}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
                  <Suspense
                    fallback={
                      <p className="text-xs text-muted-foreground">Loading refresh…</p>
                    }
                  >
                    <RefreshViewsButton
                      label={t('refreshViews')}
                      defaultFrom={monthStart}
                      defaultTo={monthEnd}
                    />
                  </Suspense>
                </div>
                {splitData ? (
                  <SplitColumns
                    sides={splitData.map((side) => ({
                      key: side.project.id,
                      title: side.project.name,
                      summary: `${side.submissions.length} ${t('videos')} · ${formatNumber(side.views)} ${t('views')}`,
                      controls: sideControls(side),
                      children: (
                        <SubmissionsTable
                          submissions={side.submissions}
                          emptyLabel={t('noVideosMatch')}
                          linkRole={side.role}
                          projectId={projectId}
                          linkFrom="videos"
                          editableProject
                          projects={projects}
                          noProjectLabel={t('noProject')}
                          refreshLabel={t('refreshThisVideo')}
                        />
                      ),
                    }))}
                  />
                ) : (
                  <SubmissionsTable
                    submissions={submissions}
                    emptyLabel={t('noVideosMatch')}
                    linkRole={roleFilter}
                    projectId={projectId}
                    linkFrom="videos"
                    editableProject
                    projects={projects}
                    noProjectLabel={t('noProject')}
                    refreshLabel={t('refreshThisVideo')}
                  />
                )}
              </div>
            ),
          },
          ] : []),
          ...(moneyData ? [
          {
            id: 'marketing',
            title: "Ahmed's wallet",
            summary:
              openMarketingRequests > 0
                ? `${openMarketingRequests} asked`
                : `${formatMoney(walletLeft, 'USD')} left`,
            hint:
              openMarketingRequests > 0
                ? 'Money requests waiting'
                : 'Sent to Ahmed − what he paid',
            children: (
              <WalletBoard
                today={today}
                isOwner={showBusiness}
                totals={walletTotals}
                entries={walletEntries}
                requests={marketingRequests}
                people={walletPeople}
                due={[...walletDue.due, ...walletDue.settled]}
              />
            ),
          },
          {
            id: 'commission',
            title: t('commissionBoard'),
            summary: formatMoney(commissionEstimate.estimate.did),
            hint: `${t('commissionPayNow')} ${formatMoney(commissionEstimate.estimate.payNow)}`,
            children: (
              <CommissionBoardPanel
                board={commissionBoard}
                today={today}
                linkRole={roleFilter}
                projectId={projectId}
                estimate={commissionEstimate.estimate}
                estimateOptions={commissionEstimate.options}
                estimateScope={commissionEstimate.scope}
                labels={{
                  settings: t('commissionSettings'),
                  save: t('commissionSave'),
                  leaderboard: t('commissionLeaderboard'),
                  empty: t('commissionEmpty'),
                  rank: t('rankingRank'),
                  person: peopleNoun,
                  standing: t('standing'),
                  views: t('views'),
                  paid: t('totalPaid'),
                  earned: t('commissionEarned'),
                  qualified: t('commissionQualified'),
                  costPer1k: t('costPer1k'),
                  vsGroup: t('vsGroup'),
                  team: t('team'),
                  estimateScope: t('commissionScope'),
                  allContracts: t('commissionAllContracts'),
                  current: t('commissionCurrent'),
                  did: t('commissionDid'),
                  didHint: t('commissionDidHint'),
                  goingToDo: t('commissionGoing'),
                  goingHint: t('commissionGoingHint'),
                  recorded: t('commissionRecorded'),
                  recordedHint: t('commissionRecordedHint'),
                  payNow: t('commissionPayNow'),
                  payNowHint: t('commissionPayNowHint'),
                  units: t('commissionUnitsHit'),
                }}
              />
            ),
          },
          {
            id: 'paydue',
            title: t('payDue'),
            summary: payDueCount === 0 ? t('allClear') : `${payDueCount}`,
            hint: t('payDueHint'),
            children: (
              <PaymentDuePanel
                due={payDueRows.due}
                settled={payDueRows.settled}
                linkRole={roleFilter}
                projectId={projectId}
                labels={{
                  empty: t('payDueEmpty'),
                  settledEmpty: t('payDueSettledEmpty'),
                  settledTitle: t('payDueSettledTitle'),
                  due: t('due'),
                  creator: peopleNoun,
                  contract: t('contracts'),
                  base: 'Base',
                  commission: 'Commission',
                  commissionMissing: t('commissionMissing'),
                  paid: t('totalPaid'),
                  balance: t('balanceDue'),
                  videos: t('videos'),
                  complete: t('videosComplete'),
                  reasonVideosComplete: t('reasonVideosComplete'),
                  reasonSchedule: t('reasonSchedule'),
                  openCreator: t('backToAdmin'),
                }}
              />
            ),
          },
          {
            id: 'payments',
            title: t('payments'),
            summary: formatMoney(periodTotal, payCurrency(roleFilter)),
            hint: `${formatMoney(paidAllTime, payCurrency(roleFilter))} ${t('totalPaid').toLowerCase()}`,
            children: (
              <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
                <PaymentsPeriodPanel
                  currency={payCurrency(roleFilter)}
                  payments={periodPayments}
                  total={periodTotal}
                  today={today}
                  defaultFrom={payFrom}
                  defaultTo={payTo}
                />
              </Suspense>
            ),
          },
          {
            id: 'outflow',
            title: 'Marketing by month',
            copy: true,
            summary: (
              <PayCadences
                monthlyUsd={outflow.plannedMonthly}
                biweeklyUsd={outflow.plannedBiweekly}
              />
            ),
            children: (
              <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
                <OutflowPanel
                  snapshot={outflow}
                  today={today}
                  defaultFrom={ofFrom}
                  defaultTo={ofTo}
                />
              </Suspense>
            ),
          },
          ] : []),
          ...(tab === 'people' ? [
          {
            id: 'manage',
            title: t('manage'),
            summary: splitData
              ? splitSummary((side) => `${side.creators.length}`)
              : `${creators.length} ${peopleNoun}`,
            hint: `${projects.length} ${t('projects')}`,
            children: splitData ? (
              <div key="manage-split" className="flex flex-col gap-4">
                <SplitColumns
                  sides={splitData.map((side) => ({
                    key: side.project.id,
                    title: side.project.name,
                    summary: `${side.creators.length} ${peopleNoun}`,
                    controls: sideControls(side),
                    children: (
                      <CreatorsManager
                        creators={side.creators}
                        pausedCreators={side.paused}
                        projects={projects}
                        roleFilter={side.role}
                        today={today}
                        currentProjectId={projectId}
                        isOwner={showBusiness}
                      />
                    ),
                  }))}
                />
                <ProjectsManager projects={projects} />
              </div>
            ) : (
              <div key="manage-grid" className="grid gap-4 lg:grid-cols-2">
                <CreatorsManager
                  key="creators-manager"
                  creators={creators}
                  pausedCreators={pausedCreators}
                  projects={projects}
                  roleFilter={roleFilter}
                  today={today}
                  currentProjectId={projectId}
                  isOwner={showBusiness}
                />
                <ProjectsManager key="projects-manager" projects={projects} />
              </div>
            ),
          },
          ] : []),
        ]}
      />
      </Suspense>

      {sheetOpen ? (
        <AnalyticsSheet
          rows={sheetRows}
          downloads={sheetDownloads}
          from={aFrom}
          to={aTo}
          today={today}
          projectId={aProjectId}
          projects={projects}
          showBusiness={showBusiness}
          revenueCatProjectIds={revenueCatLinks()
            .map((l) => projects.find((p) => p.name.trim().toLowerCase() === l.appName.toLowerCase())?.id)
            .filter((id): id is number => id != null)}
        />
      ) : null}

      <div className="mt-6">
        <AssistantDrawer
          title={t('assistantTitle')}
          subtitle={t('assistantSubtitle')}
          maximizeLabel={t('assistantMaximize')}
          minimizeLabel={t('assistantMinimize')}
        >
          <AssistantChat
            embedded
            labels={{
              title: t('assistantTitle'),
              subtitle: t('assistantSubtitle'),
              placeholder: t('assistantPlaceholder'),
              send: t('assistantSend'),
              you: t('assistantYou'),
              assistant: t('assistantBot'),
              buildIt: t('assistantBuildIt'),
              cancel: t('assistantCancel'),
              working: t('assistantWorking'),
              emptyHint: t('assistantEmpty'),
              example1: t('assistantExample1'),
              example2: t('assistantExample2'),
              example3: t('assistantExample3'),
              building: t('assistantBuilding'),
              cancelled: t('assistantCancelled'),
              done: t('assistantDone'),
              error: t('assistantError'),
              undo: t('assistantUndo'),
              redo: t('assistantRedo'),
            }}
          />
        </AssistantDrawer>
      </div>
    </main>
  )
}
