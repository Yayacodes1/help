import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  getActiveContract,
  getAllProjects,
  getContractComparisons,
  getContractsForCreator,
  getCreatorById,
  getCreatorConsistency,
  getCreatorPaidTotal,
  getCreatorStats,
  getPaySummary,
  getPaymentsForCreator,
  getProjectById,
  getServerToday,
  getSubmissionsForCreator,
  contractWindow,
  getScheduleBreaks,
  getOperationalToday,
} from '@/lib/queries'
import { ConsistencyCalendar } from '@/components/admin/consistency-calendar'
import { CreatorContractForm } from '@/components/admin/creator-contract-form'
import { ContractsManager } from '@/components/admin/contracts-manager'
import { PaymentsManager } from '@/components/admin/payments-manager'
import { PanelBoard } from '@/components/admin/panel-board'
import { CreatorVideosPanel } from '@/components/admin/creator-videos-panel'
import { LanguageToggle } from '@/components/language-toggle'
import { RoleQuickSelect } from '@/components/admin/role-quick-select'
import { BreaksManager } from '@/components/admin/breaks-manager'
import { StrikesManager } from '@/components/admin/strikes-manager'
import { getCreatorStrikeSummary, syncReposterStrikes } from '@/lib/strikes'
import { PersonHandlesLine } from '@/components/person-handles'
import { StatCard } from '@/components/stat-card'
import { StandingBadge } from '@/components/standing-badge'
import { getCommissionBoard, getCommissionBreakdown, getCommissionEstimate } from '@/lib/commission-data'
import { CreatorCommissionPanel } from '@/components/admin/creator-commission-panel'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import { adminDashboardHref, adminReturnPanel } from '@/lib/admin-href'

export const dynamic = 'force-dynamic'

export default async function CreatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    panel?: string
    role?: string
    project?: string
    from?: string
    cmContract?: string
    cmFrom?: string
    cmTo?: string
  }>
}) {
  if (!(await isAdmin())) redirect('/login')
  await ensureCreatorTrackingColumns()

  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isFinite(id)) notFound()

  const creator = await getCreatorById(id)
  if (!creator) notFound()

  const locale = await getLocale()
  const t = createT(locale)

  const sp = await searchParams
  const today = await getServerToday()
  const opToday = await getOperationalToday()
  if (creator.role === 'reposter') {
    await syncReposterStrikes({ today: opToday, creatorId: creator.id })
  }
  const cmContractRaw = Number(sp.cmContract)
  const cmContractId =
    Number.isFinite(cmContractRaw) && cmContractRaw > 0 ? cmContractRaw : null
  const monthStart = `${today.slice(0, 7)}-01`
  const cmFrom = /^\d{4}-\d{2}-\d{2}$/.test(sp.cmFrom ?? '') ? sp.cmFrom! : monthStart
  const cmTo = /^\d{4}-\d{2}-\d{2}$/.test(sp.cmTo ?? '') ? sp.cmTo! : today

  const [projects, consistency, stats, submissions, comparisons, active, payments, contracts, paidTotal, breaks, strikeSummary, personPerf, personEstimate, commissionBreakdown] =
    await Promise.all([
      getAllProjects(),
      getCreatorConsistency(creator, today),
      getCreatorStats(creator.id),
      getSubmissionsForCreator(creator.id),
      getContractComparisons(creator, today),
      getActiveContract(creator.id, today),
      getPaymentsForCreator(creator.id),
      getContractsForCreator(creator.id),
      getCreatorPaidTotal(creator.id),
      getScheduleBreaks(creator.id),
      creator.role === 'reposter'
        ? getCreatorStrikeSummary(creator.id, opToday)
        : Promise.resolve(null),
      getCommissionBoard({
        from: cmFrom,
        to: cmTo,
        today,
        creatorId: creator.id,
      }),
      getCommissionEstimate({
        today,
        creatorId: creator.id,
        contractId: cmContractId,
      }),
      getCommissionBreakdown({
        today,
        creatorId: creator.id,
        contractId: cmContractId,
        from: cmFrom,
        to: cmTo,
      }),
    ])
  const perf = personPerf.rows[0] ?? null
  const commissionTermsSummary = commissionBreakdown.terms
    ? `${commissionBreakdown.terms.countMode === 'batch' ? 'Per batch' : 'Per video'} · ${formatMoney(commissionBreakdown.terms.commissionAmount, 'SAR')} every ${formatNumber(commissionBreakdown.terms.viewsThreshold)} views · ${commissionBreakdown.terms.reelCount} expected blocks`
    : null
  const project = creator.project_id ? await getProjectById(creator.project_id) : null
  const pay = await getPaySummary(creator, today)
  const window = contractWindow(creator, today, active)
  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)
  const latestPayment = payments[0] ?? null
  const activeCompare = comparisons.find((c) => c.isActive)

  const defaultPanel =
    sp.panel && ['consistency', 'contracts', 'payments', 'profile', 'videos', 'strikes', 'commission'].includes(sp.panel)
      ? sp.panel
      : null
  const returnPanel = adminReturnPanel(sp.from)
  const backHref = adminDashboardHref({
    role: sp.role || creator.role,
    projectId: sp.project,
    panel: returnPanel,
  })
  const backLabel = returnPanel === 'manage' ? t('backToCreators') : t('backToAdmin')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={backHref}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            {backLabel}
          </Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {creator.name}
            <RoleQuickSelect creatorId={creator.id} role={creator.role} size="md" />
            {perf ? <StandingBadge standing={perf.standing} /> : null}
          </h1>
          <PersonHandlesLine person={creator} className="mt-1 text-xs text-muted-foreground" />
          <p className="mt-1 text-sm text-muted-foreground">
            {project?.name ?? t('noProject')}
            {active
              ? ` · ${active.name}: ${formatDate(active.start_date)}${
                  active.end_date ? ` → ${formatDate(active.end_date)}` : ` → ${t('open')}`
                }`
              : ` · ${t('noContractSet')} · ${t('tracking')} ${formatDate(window.start)} → ${formatDate(window.end)}`}
          </p>
        </div>
        <LanguageToggle
          locale={locale}
          labels={{ english: t('english'), arabic: t('arabic') }}
        />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label={t('currentStreak')} value={`${consistency.currentStreak} ${t('days')}`} />
        {strikeSummary ? (
          <StatCard
            label={t('strikeCount')}
            value={strikeSummary.contractStrikes}
            hint={
              strikeSummary.needsCorrective
                ? t('strikesCorrectiveFlag')
                : strikeSummary.postedToday
                  ? t('strikePostedToday')
                  : t('strikeMissedToday')
            }
          />
        ) : null}
        <StatCard
          label={t('videoProgress')}
          value={
            activeCompare?.videoRate != null
              ? `${Math.round(activeCompare.videoRate * 100)}%`
              : `${Math.round(consistency.hitRate * 100)}%`
          }
        />
        <StatCard
          label={t('contractVideos')}
          value={
            activeCompare
              ? activeCompare.targetTotal > 0
                ? `${activeCompare.videoCount}/${activeCompare.targetTotal}`
                : `${activeCompare.videoCount}`
              : `${stats.total_videos}`
          }
        />
        <StatCard
          label={t('views')}
          value={formatNumber(perf?.views ?? totalViews)}
          hint={
            perf
              ? `${perf.qualifiedUnits} ${t('commissionQualified').toLowerCase()}`
              : undefined
          }
        />
        <StatCard
          label={t('commissionEarned')}
          value={formatMoney(perf?.commissionEarned ?? 0)}
          hint={
            perf?.costPer1k != null ? `${formatMoney(perf.costPer1k)} / 1k` : undefined
          }
        />
        <StatCard label={t('totalPaid')} value={formatMoney(paidTotal)} />
        <StatCard
          label={t('lastPaid')}
          value={
            latestPayment
              ? `${formatMoney(latestPayment.amount)}`
              : pay.lastPaidAt
                ? formatDate(pay.lastPaidAt)
                : '—'
          }
        />
      </section>
      <p className="mt-2 text-xs text-muted-foreground">{t('paidFromPaymentsOnly')}</p>

      {creator.notes && (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">{t('notes')}: </span>
          {creator.notes}
        </p>
      )}

      <p className="mt-6 mb-3 text-xs text-muted-foreground">{t('tapSection')}</p>

      <PanelBoard
        defaultOpen={defaultPanel}
        columns={3}
        closeLabel={t('close')}
        panels={[
          {
            id: 'consistency',
            title: t('consistency'),
            summary: `${Math.round(consistency.hitRate * 100)}%`,
            hint: active ? active.name : undefined,
            children: (
              <div>
                {consistency.streakEpochStart && consistency.streakEpochEnd ? (
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t('streakPeriod')}: {formatDate(consistency.streakEpochStart)} →{' '}
                    {formatDate(consistency.streakEpochEnd)}. {t('streakPeriodHint')}
                  </p>
                ) : null}
                <ConsistencyCalendar days={consistency.days} />
                <p className="mt-3 text-xs text-muted-foreground">
                  {consistency.missDays} · {consistency.partialDays} · {consistency.currentStreak} /{' '}
                  {consistency.bestStreak}
                </p>
                {'previousPeriod' in consistency && consistency.previousPeriod ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('lastStreakPeriod')}: {consistency.previousPeriod.bestStreak}{' '}
                    {t('days')} · {Math.round(consistency.previousPeriod.hitRate * 100)}%.{' '}
                    {t('lastStreakPeriodHint')}
                  </p>
                ) : null}
              </div>
            ),
          },
          ...(strikeSummary
            ? [
                {
                  id: 'strikes',
                  title: t('strikesTitle'),
                  summary: `${strikeSummary.contractStrikes}`,
                  hint: strikeSummary.needsCorrective
                    ? t('strikesCorrectiveFlag')
                    : t('strikeCount'),
                  children: (
                    <StrikesManager
                      creatorId={creator.id}
                      today={opToday}
                      strikes={strikeSummary.strikes}
                      labels={{
                        title: t('strikesTitle'),
                        hint: t('strikesHint'),
                        date: t('strikeDate'),
                        reason: t('strikeReason'),
                        add: t('strikeAdd'),
                        remove: t('strikeRemove'),
                        empty: t('strikeEmpty'),
                        auto: t('strikeSourceAuto'),
                        manual: t('strikeSourceManual'),
                      }}
                    />
                  ),
                },
              ]
            : []),
          {
            id: 'contracts',
            title: t('contracts'),
            summary: comparisons.length === 0 ? t('noneYet') : `${comparisons.length} ${t('periods')}`,
            hint: active ? active.name : t('addAContract'),
            children: (
              <div className="flex flex-col gap-4">
                <ContractsManager
                  creatorId={creator.id}
                  today={today}
                  comparisons={comparisons}
                />
                <BreaksManager creatorId={creator.id} today={today} breaks={breaks} />
              </div>
            ),
          },
          {
            id: 'payments',
            title: t('payments'),
            summary: formatMoney(paidTotal),
            hint: latestPayment
              ? `${t('lastPaid')} ${formatDate(latestPayment.paid_on)}`
              : pay.nextPayAt
                ? formatDate(pay.nextPayAt)
                : t('recordAPayment'),
            children: (
              <PaymentsManager
                creatorId={creator.id}
                today={today}
                contracts={contracts}
                payments={payments}
                paidTotal={paidTotal}
              />
            ),
          },
          {
            id: 'profile',
            title: t('profile'),
            summary: `${creator.goal_instagram + creator.goal_tiktok}/day`,
            hint: t('fallbackGoals'),
            children: <CreatorContractForm creator={creator} projects={projects} />,
          },
          {
            id: 'commission',
            title: t('commissionBoard'),
            summary: formatMoney(personEstimate.estimate.did, 'SAR'),
            hint: `${t('commissionPayNow')} ${formatMoney(personEstimate.estimate.payNow, 'SAR')}`,
            children: (
              <CreatorCommissionPanel
                creatorId={creator.id}
                today={today}
                estimate={personEstimate.estimate}
                options={personEstimate.options}
                selectedId={personEstimate.scope}
                from={cmFrom}
                to={cmTo}
                lines={commissionBreakdown.lines}
                totalSar={commissionBreakdown.totalSar}
                termsSummary={commissionTermsSummary}
                refreshLabel={t('refreshViews')}
                perf={
                  perf
                    ? {
                        standing: perf.standing,
                        viewsScore: perf.viewsScore,
                        commissionScore: perf.commissionScore,
                        spendScore: perf.spendScore,
                        views: perf.views,
                        qualifiedUnits: perf.qualifiedUnits,
                        units: perf.units,
                        commissionEarned: perf.commissionEarned,
                        paid: perf.paid,
                        costPer1k: perf.costPer1k,
                      }
                    : null
                }
                labels={{
                  scope: t('commissionScope'),
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
                  empty: t('commissionEmpty'),
                  missing: t('commissionMissing'),
                  earned: t('commissionEarned'),
                  qualified: t('commissionQualified'),
                  views: t('views'),
                  paid: t('totalPaid'),
                  costPer1k: t('costPer1k'),
                  dateRange: t('commissionDateRange'),
                  perVideo: t('commissionPerVideo'),
                }}
              />
            ),
          },
          {
            id: 'videos',
            title: t('videos'),
            summary: `${stats.total_videos}`,
            hint: `IG ${stats.instagram_videos} · TT ${stats.tiktok_videos} · ${formatNumber(totalViews)} ${t('views')}`,
            children: (
              <CreatorVideosPanel
                creatorId={creator.id}
                today={today}
                submissions={submissions.map((s) => ({
                  ...s,
                  creator_name: creator.name,
                }))}
                emptyLabel={t('noVideosYet')}
                labels={{
                  both: t('platformBoth'),
                  instagram: t('instagram'),
                  tiktok: t('tiktok'),
                  videos: t('videosWord'),
                  views: t('views'),
                  noMatch: t('noVideosMatch'),
                  refreshViews: t('refreshViews'),
                  refreshThisVideo: t('refreshThisVideo'),
                }}
              />
            ),
          },
        ]}
      />
    </main>
  )
}
