import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  attachTracking,
  getAdminSubmissions,
  getAllPaidTotal,
  getAllProjects,
  getCreatorsWithProgressOnDate,
  getMissesFromProgress,
  getPaymentDueList,
  getPaymentsInRange,
  getPaymentsTotalInRange,
  getServerToday,
  getOperationalToday,
  type AdminFilters,
} from '@/lib/queries'
import {
  defaultAnalyticsRange,
  getDailyAnalytics,
  getDailyViewsByCreator,
  getTopVideos,
  getViewsLeaderboard,
  getViewsSummary,
} from '@/lib/analytics'
import { monthRange, parseYearMonth, rankingMonthRange } from '@/lib/campaign'
import {
  ensureMarketingTables,
  getMarketingBalances,
  listMarketingExpenses,
  listMarketingRequests,
  listMarketingTransfers,
} from '@/lib/marketing'
import { StatCard } from '@/components/stat-card'
import { FiltersBar } from '@/components/admin/filters-bar'
import { ProjectsManager } from '@/components/admin/projects-manager'
import { CreatorsManager } from '@/components/admin/creators-manager'
import { ProjectSelector } from '@/components/admin/project-selector'
import { RoleSelector } from '@/components/admin/role-selector'
import { TodayProgress } from '@/components/admin/today-progress'
import { DayNavigator } from '@/components/admin/day-navigator'
import { LogoutButton } from '@/components/admin/logout-button'
import { MissList } from '@/components/admin/miss-list'
import { PanelBoard } from '@/components/admin/panel-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { PaymentsPeriodPanel } from '@/components/admin/payments-period-panel'
import { PaymentDuePanel } from '@/components/admin/payment-due-panel'
import { AssistantChat } from '@/components/admin/assistant-chat'
import { AssistantDrawer } from '@/components/admin/assistant-drawer'
import { AnalyticsPanel } from '@/components/admin/analytics-panel'
import { TopVideosPanel } from '@/components/admin/top-videos-panel'
import { MarketingBudgetBoard } from '@/components/marketing/marketing-budget-board'
import { OutflowPanel } from '@/components/admin/outflow-panel'
import { PayCadences } from '@/components/admin/pay-cadence'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { LanguageToggle } from '@/components/language-toggle'
import { formatDate, formatMoney, formatNumber, formatYearMonth } from '@/lib/format'
import { getOutflowSnapshot, type OutflowView } from '@/lib/outflow'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import type { Platform } from '@/lib/db'
import { parseRoleFilter, roleFilterToSql } from '@/lib/participant-role'
import { getLeagueBoard } from '@/lib/ranking'
import { RankingBoard } from '@/components/ranking-board'
import { RankingFilters } from '@/components/admin/ranking-filters'
import { StrikesPanel } from '@/components/admin/strikes-panel'
import { getReposterStrikeBoard, syncReposterStrikes } from '@/lib/strikes'
import { getProjectViewsBoard } from '@/lib/project-views'
import { ProjectViewsPanel } from '@/components/admin/project-views-panel'

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
    payFrom?: string
    payTo?: string
    aFrom?: string
    aTo?: string
    aCreator?: string
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

  const projectId = sp.project ? Number(sp.project) : undefined
  const roleFilter = parseRoleFilter(sp.role)
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
  const aCreatorId = sp.aCreator ? Number(sp.aCreator) : null

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
      : 'total'

  const pvFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.pvFrom ?? '')
    ? sp.pvFrom!
    : analyticsDefault.from
  const pvTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.pvTo ?? '') ? sp.pvTo! : analyticsDefault.to
  const pvKind = parseRoleFilter(
    sp.pvKind === 'creator' || sp.pvKind === 'reposter' || sp.pvKind === 'all'
      ? sp.pvKind
      : sp.role,
  )
  const pvKindSql = roleFilterToSql(pvKind)
  const pvPersonId = sp.pvPerson ? Number(sp.pvPerson) : null
  const pvCreatorId = pvPersonId != null && Number.isFinite(pvPersonId) ? pvPersonId : null

  const rankMonth = parseYearMonth(sp.rankMonth, today)
  const { start: rankFrom, end: rankTo } = rankingMonthRange(rankMonth, today)
  const rankProjectRaw = sp.rankProject ? Number(sp.rankProject) : NaN
  const rankProjectId = Number.isFinite(rankProjectRaw) && rankProjectRaw > 0 ? rankProjectRaw : null
  const rankRole =
    sp.rankRole === 'creator' || sp.rankRole === 'reposter' || sp.rankRole === 'all'
      ? sp.rankRole
      : 'all'
  const rankRoleSql = roleFilterToSql(rankRole)

  const [
    submissions,
    projects,
    creatorsBase,
    periodPayments,
    periodTotal,
    paidAllTime,
    payDueRows,
    dailyAnalytics,
    creatorDaily,
    byCreatorDaily,
    leaderboard,
    viewsSummary,
    topVideos,
    marketingBalances,
    marketingTransfers,
    marketingExpenses,
    marketingRequests,
    outflow,
    league,
    projectViews,
    projectViewVideos,
    strikeBoard,
  ] = await Promise.all([
    getAdminSubmissions(filters),
    getAllProjects(),
    getCreatorsWithProgressOnDate(selectedDay, projectId, roleSql),
    getPaymentsInRange(payFrom, payTo, undefined, roleSql),
    getPaymentsTotalInRange(payFrom, payTo, undefined, roleSql),
    getAllPaidTotal(projectId, roleSql),
    getPaymentDueList(today, projectId, roleSql),
    getDailyAnalytics({ from: aFrom, to: aTo, projectId: projectId ?? null, role: roleSql }),
    aCreatorId
      ? getDailyAnalytics({
          from: aFrom,
          to: aTo,
          projectId: projectId ?? null,
          creatorId: aCreatorId,
          role: roleSql,
        })
      : Promise.resolve([]),
    getDailyViewsByCreator({
      from: aFrom,
      to: aTo,
      projectId: projectId ?? null,
      role: roleSql,
    }),
    getViewsLeaderboard({
      from: aFrom,
      to: aTo,
      projectId: projectId ?? null,
      role: roleSql,
      limit: 1000,
    }),
    getViewsSummary({ from: aFrom, to: aTo, projectId: projectId ?? null, role: roleSql }),
    getTopVideos({
      from: tvFrom,
      to: tvTo,
      projectId: projectId ?? null,
      role: roleSql,
      platform: tvPlatform,
      limit: 50,
    }),
    getMarketingBalances(),
    listMarketingTransfers(),
    listMarketingExpenses(),
    listMarketingRequests(),
    getOutflowSnapshot({ from: ofFrom, to: ofTo, view: ofView, countMode: 'base' }),
    getLeagueBoard({
      from: rankFrom,
      to: rankTo,
      projectId: rankProjectId,
      role: rankRoleSql,
    }),
    getProjectViewsBoard({
      from: pvFrom,
      to: pvTo,
      role: pvKindSql,
    }),
    pvCreatorId != null
      ? getAdminSubmissions({
          creatorId: pvCreatorId,
          role: pvKindSql,
          from: pvFrom,
          to: pvTo,
        })
      : Promise.resolve([]),
    getReposterStrikeBoard(opToday),
  ])
  const pvModeRaw = sp.pvMode
  const pvMode: 'combined' | number =
    pvModeRaw &&
    pvModeRaw !== 'combined' &&
    projectViews.projects.some((p) => String(p.id) === pvModeRaw)
      ? Number(pvModeRaw)
      : 'combined'
  const projectViewsHint = projectViews.projects
    .slice(0, 2)
    .map((p) => `${p.name} ${formatNumber(projectViews.totals.viewsByProject[p.id] ?? 0)}`)
    .join(' · ')
  const creators = await attachTracking(creatorsBase, today)
  const misses = getMissesFromProgress(creators)
  const openMarketingRequests = marketingRequests.filter((r) => r.status === 'open').length
  const marketingLeft = marketingBalances.reduce((sum, b) => sum + b.left, 0)

  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)
  const creatorViews = submissions.reduce(
    (sum, s) => sum + (s.creator_role === 'reposter' ? 0 : s.views ?? 0),
    0,
  )
  const reposterViews = totalViews - creatorViews
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
  const payDueCount = payDueRows.due.length

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

  const defaultPanel =
    sp.panel &&
    [
      'analytics',
      'ranking',
      'projectviews',
      'topvideos',
      'progress',
      'attention',
      'videos',
      'paydue',
      'payments',
      'marketing',
      'outflow',
      'manage',
      'strikes',
    ].includes(sp.panel)
      ? sp.panel
      : openMarketingRequests > 0
        ? 'marketing'
        : payDueCount > 0
          ? 'paydue'
          : strikeBoard.needsCorrective > 0
            ? 'strikes'
            : misses.length > 0
              ? 'attention'
              : 'analytics'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('adminDashboard')}</h1>
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
      </header>

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

      <p className="mt-6 mb-3 text-xs text-muted-foreground">{t('tapSection')}</p>

      <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
      <PanelBoard
        defaultOpen={defaultPanel}
        columns={3}
        closeLabel={t('close')}
        panels={[
          {
            id: 'analytics',
            title: t('analytics'),
            summary: formatNumber(viewsSummary.views),
            hint: `${viewsSummary.videos} ${t('videos')} · ${aFrom.slice(5)}→${aTo.slice(5)}`,
            children: (
              <AnalyticsPanel
                daily={dailyAnalytics}
                creatorDaily={creatorDaily}
                byCreatorDaily={byCreatorDaily}
                leaderboard={leaderboard}
                creators={creators.map((c) => ({ id: c.id, name: c.name }))}
                selectedCreatorId={aCreatorId}
                today={today}
                defaultFrom={aFrom}
                defaultTo={aTo}
                labels={{
                  views: t('views'),
                  videos: t('videos'),
                  creator: peopleNoun,
                  allCreators: roleFilter === 'reposter' ? t('allReposters') : t('allCreators'),
                  instagram: t('instagram'),
                  tiktok: t('tiktok'),
                  showViews: t('showViews'),
                  showVideos: t('showVideos'),
                  topCreators:
                    roleFilter === 'reposter' ? t('topReposters') : t('topCreators'),
                  empty: t('analyticsEmpty'),
                  from: t('from'),
                  to: t('to'),
                  apply: t('apply'),
                  showing: t('analyticsShowing'),
                  chartLine: t('chartLine'),
                  chartBar: t('chartBar'),
                  chartLog: t('chartLog'),
                  chartLinear: t('chartLinear'),
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
                  today={today}
                  defaultFrom={tvFrom}
                  defaultTo={tvTo}
                />
              </Suspense>
            ),
          },
          {
            id: 'progress',
            title: isToday ? t('todaysProgress') : t('dailyProgress'),
            summary: `${creatorsPostedToday}/${creators.length} ${t('active')}`,
            hint: isToday ? t('goalsForToday') : formatDate(selectedDay),
            children: (
              <div className="flex flex-col gap-3">
                <DayNavigator selectedDay={selectedDay} today={today} />
                <TodayProgress
                  creators={creators}
                  linkRole={roleFilter}
                  projectId={projectId}
                />
              </div>
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
                }}
              />
            ),
          },
          {
            id: 'attention',
            title: t('needsAttention'),
            summary: misses.length === 0 ? t('allClear') : `${misses.length} ${t('behind')}`,
            hint: isToday ? t('today') : formatDate(selectedDay),
            children: (
              <MissList
                misses={misses}
                dayLabel={isToday ? t('today') : formatDate(selectedDay)}
                linkRole={roleFilter}
                projectId={projectId}
              />
            ),
          },
          {
            id: 'videos',
            title: t('videos'),
            summary: `${totalVideos}`,
            hint: `${formatNumber(totalViews)} ${t('views')}`,
            children: (
              <div className="flex flex-col gap-3">
                <FiltersBar
                  creators={creators}
                  today={today}
                  defaultFrom={monthStart}
                  defaultTo={monthEnd}
                />
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
              </div>
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
            summary: formatMoney(periodTotal),
            hint: `${formatMoney(paidAllTime)} ${t('totalPaid').toLowerCase()}`,
            children: (
              <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
                <PaymentsPeriodPanel
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
            id: 'marketing',
            title: 'Marketing budget',
            summary:
              openMarketingRequests > 0
                ? `${openMarketingRequests} requests`
                : formatMoney(marketingLeft),
            hint:
              openMarketingRequests > 0
                ? 'Open money requests'
                : 'Sent − spent left',
            children: (
              <MarketingBudgetBoard
                today={today}
                balances={marketingBalances}
                transfers={marketingTransfers}
                expenses={marketingExpenses}
                requests={marketingRequests}
              />
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
          {
            id: 'manage',
            title: t('manage'),
            summary: `${creators.length} ${peopleNoun}`,
            hint: `${projects.length} ${t('projects')}`,
            children: (
              <div key="manage-grid" className="grid gap-4 lg:grid-cols-2">
                <CreatorsManager
                  key="creators-manager"
                  creators={creators}
                  projects={projects}
                  roleFilter={roleFilter}
                  today={today}
                  currentProjectId={projectId}
                />
                <ProjectsManager key="projects-manager" projects={projects} />
              </div>
            ),
          },
        ]}
      />
      </Suspense>

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
