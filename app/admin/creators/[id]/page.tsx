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
  searchParams: Promise<{ panel?: string; role?: string; project?: string; from?: string }>
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
  const [projects, consistency, stats, submissions, comparisons, active, payments, contracts, paidTotal, breaks, strikeSummary] =
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
    ])
  const project = creator.project_id ? await getProjectById(creator.project_id) : null
  const pay = await getPaySummary(creator, today)
  const window = contractWindow(creator, today, active)
  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)
  const latestPayment = payments[0] ?? null
  const activeCompare = comparisons.find((c) => c.isActive)

  const defaultPanel =
    sp.panel && ['consistency', 'contracts', 'payments', 'profile', 'videos', 'strikes'].includes(sp.panel)
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

      <section className={`grid grid-cols-2 gap-3 ${creator.role === 'reposter' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
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
                <ConsistencyCalendar days={consistency.days} />
                <p className="mt-3 text-xs text-muted-foreground">
                  {consistency.missDays} · {consistency.partialDays} · {consistency.currentStreak} /{' '}
                  {consistency.bestStreak}
                </p>
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
            id: 'videos',
            title: t('videos'),
            summary: `${stats.total_videos}`,
            hint: `IG ${stats.instagram_videos} · TT ${stats.tiktok_videos} · ${formatNumber(totalViews)} ${t('views')}`,
            children: (
              <CreatorVideosPanel
                creatorId={creator.id}
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
