import Link from 'next/link'
import { after } from 'next/server'
import { LogOut, Send } from 'lucide-react'
import { SubmitForm } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { CreatorStats } from '@/components/creator-stats'
import { UsernameGate } from '@/components/username-gate'
import { PanelBoard } from '@/components/admin/panel-board'
import { LanguageToggle } from '@/components/language-toggle'
import {
  getActiveContract,
  getAllProjects,
  getContractComparisons,
  getCreatorByName,
  getServerNowIso,
  getServerTimeHm,
  getSubmissionsForCreator,
  getSubmissionsForCreatorOnDate,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getCreatorConsistency,
  getPaymentsForCreator,
  getCreatorPaidTotal,
  goalsForContract,
} from '@/lib/queries'
import { findMiyqatProject, isMiyqatProjectName, projectToneClass } from '@/lib/project-scope'
import { StrikeBanner } from '@/components/strike-banner'
import { operationalDayFromIso } from '@/lib/operational-day'
import { getCreatorStrikeSummary, syncReposterStrikes } from '@/lib/strikes'
import { loginHandleFor } from '@/lib/usernames'
import { PLATFORMS, sql } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import type { BrandProject } from '@/components/submit-form'
import { describeSchedule, scheduleFromContract } from '@/lib/posting-schedule'
import { formatDate, formatMoney, formatNumber, payCurrency } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderForCreator } from '@/lib/leaders'
import { getOutreachMemberByCreator } from '@/lib/outreach'
import { outreachGreeting } from '@/lib/outreach-status'
import { ReposterDashboard } from '@/app/submit/reposter-dashboard'
import { creatorIsPaused } from '@/lib/pause-person'
import { VideoIdeasPanel } from '@/components/video-ideas-panel'
import { MyVideosPanel } from '@/components/my-videos-panel'
import { getTopVideos } from '@/lib/analytics'
import { getCreatorCommissionSheets } from '@/lib/commission-data'
import { addDays } from '@/lib/campaign'
import { SubmitModeToggle } from '@/components/submit-mode-toggle'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function isValidDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{
    u?: string
    date?: string
    panel?: string
    tab?: string
    taskDay?: string
    vPage?: string
    vSize?: string
    cFrom?: string
    cTo?: string
    rFrom?: string
    rTo?: string
    videoDate?: string
    checkDate?: string
    mode?: string
    ideasPeriod?: string
    ideasLimit?: string
    ideasSort?: string
    ideasProject?: string
  }>
}) {
  const {
    u,
    date: dateParam,
    panel,
    tab,
    taskDay,
    vPage,
    vSize,
    cFrom,
    cTo,
    rFrom,
    rTo,
    videoDate,
    checkDate,
    mode: modeParam,
    ideasPeriod,
    ideasLimit,
    ideasSort,
    ideasProject: ideasProjectParam,
  } = await searchParams
  const [locale, leaderSession] = await Promise.all([getLocale(), getLeaderSession()])
  const t = createT(locale)
  const creator = u ? await getCreatorByName(u) : null

  if (!creator) {
    return <UsernameGate initialUsername={u ?? ''} locale={locale} />
  }
  if (await creatorIsPaused(creator.id)) {
    return <UsernameGate locale={locale} notice={t('accountPaused')} />
  }

  const login = loginHandleFor(creator)
  const username = login.handle || creator.name
  let outreachMember: { role: 'upper' | 'outreach'; name: string } | null = null
  try {
    outreachMember = await getOutreachMemberByCreator(creator.id)
  } catch {
    outreachMember = null
  }
  const outreachWelcome =
    outreachMember?.role === 'outreach'
      ? outreachGreeting({ name: creator.name, role: 'outreach', via: 'creator' })
      : null
  const outreachHref = outreachMember ? `/outreach?u=${encodeURIComponent(u ?? username)}` : null
  if (creator.role === 'reposter') {
    const todayIso = operationalDayFromIso(await getServerNowIso())
    after(() => {
      void syncReposterStrikes({ today: todayIso, creatorId: creator.id }).catch(() => undefined)
    })
    let grouped = false
    try {
      grouped = (await getLeaderForCreator(creator.id)) != null
    } catch {
      grouped = false
    }
    if (grouped) {
      try {
        return await ReposterDashboard({
          creator,
          username,
          locale,
          outreachWelcome,
          outreachHref,
          searchParams: {
            u,
            date: dateParam,
            panel,
            tab,
            taskDay,
            vPage,
            vSize,
            cFrom,
            cTo,
            rFrom,
            rTo,
            videoDate,
            checkDate,
          },
        })
      } catch {
        /* grouped dashboard failed — still let them in on the upload page */
      }
    }
  }
  const [serverNow, defaultTime] = await Promise.all([
    getServerNowIso(),
    getServerTimeHm(),
  ])
  const opToday = operationalDayFromIso(serverNow)
  const today = opToday
  const { creatorIsOnProbation } = await import('@/lib/creator-fitness')
  const onProbation =
    creator.role === 'creator' ? await creatorIsOnProbation(creator.id).catch(() => false) : false
  const checkIn =
    creator.role === 'creator'
      ? await import('@/lib/telegram-creator-notes')
          .then((m) => m.getCreatorCheckInStats(creator.id))
          .catch(() => null)
      : null
  const date = onProbation ? today : isValidDate(dateParam) ? dateParam : today
  const isToday = date === today
  const submitMode =
    modeParam === 'ideas' ? 'ideas' : modeParam === 'mine' ? 'mine' : 'post'

  const projects = await getAllProjects()
  const miqatId = findMiyqatProject(projects)?.id ?? null
  const notekId = projects.find((p) => /notek|نوتك/i.test(p.name))?.id ?? null
  const homeProject = projects.find((p) => p.id === creator.project_id)
  const isMiqatHome = isMiyqatProjectName(homeProject?.name)
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

  const [
    counts,
    submissions,
    stats,
    consistency,
    active,
    comparisons,
    strikeSummary,
    myPayments,
    loadedPaidTotal,
    commissionPack,
    postedProjectRows,
  ] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getCreatorStats(creator.id),
    getCreatorConsistency(creator, today),
    getActiveContract(creator.id, today),
    creator.role === 'creator' || panel === 'contract'
      ? getContractComparisons(creator, today)
      : Promise.resolve([]),
    creator.role === 'reposter'
      ? getCreatorStrikeSummary(creator.id, opToday).catch(() => null)
      : Promise.resolve(null),
    panel === 'payments' ? getPaymentsForCreator(creator.id) : Promise.resolve([]),
    getCreatorPaidTotal(creator.id),
    creator.role === 'creator'
      ? getCreatorCommissionSheets(creator.id, today).catch(() => null)
      : Promise.resolve(null),
    // Distinct projects they have already posted under (dual Notek + Miqat).
    sql`
      SELECT DISTINCT project_id
      FROM submissions
      WHERE creator_id = ${creator.id}
        AND project_id IS NOT NULL
    ` as unknown as Promise<Array<{ project_id: number }>>,
  ])

  // Projects this creator belongs to: home + brand handles + past posts.
  const ideaProjectMap = new Map<number, string>()
  if (homeProject) ideaProjectMap.set(homeProject.id, homeProject.name)
  for (const b of brandProjects) {
    const p = projects.find((x) => x.id === b.projectId)
    if (p) ideaProjectMap.set(p.id, p.name)
  }
  for (const row of postedProjectRows) {
    const pid = Number(row.project_id)
    const p = projects.find((x) => x.id === pid)
    if (p) ideaProjectMap.set(p.id, p.name)
  }
  // No home + no handles + no posts → still allow every project (admin will assign later).
  if (ideaProjectMap.size === 0) {
    for (const p of projects) ideaProjectMap.set(p.id, p.name)
  }
  const ideaProjectOptions = [...ideaProjectMap.entries()].map(([id, name]) => ({ id, name }))
  const submitProjectOptions = ideaProjectOptions
  const defaultSubmitProjectId =
    creator.project_id != null && ideaProjectMap.has(creator.project_id)
      ? creator.project_id
      : submitProjectOptions[0]?.id ?? null
  const ideasMultiProject = ideaProjectOptions.length > 1
  const ideasLockedProjectId = ideasMultiProject
    ? null
    : ideaProjectOptions[0]?.id ?? creator.project_id ?? null
  const ideasProjectPicked =
    ideasProjectParam != null && Number.isFinite(Number(ideasProjectParam))
      ? Number(ideasProjectParam)
      : null
  const ideasProjectId = ideasMultiProject
    ? ideasProjectPicked != null && ideaProjectMap.has(ideasProjectPicked)
      ? ideasProjectPicked
      : ideaProjectOptions[0]?.id ?? null
    : ideasLockedProjectId
  const paidTotal = loadedPaidTotal
  const activeCommissionSheet =
    commissionPack?.sheets.find((s) => s.isActive) ??
    (active ? commissionPack?.sheets.find((s) => s.id === active.id) : null) ??
    null

  const ideasDays = ideasPeriod === '60' ? 60 : 30
  const ideasLimitN = [5, 10, 15, 20].includes(Number(ideasLimit)) ? Number(ideasLimit) : 10
  const ideasSortMode = ideasSort === 'trending' ? 'trending' : 'views'
  const ideaVideos =
    submitMode === 'ideas' && creator.role === 'creator'
      ? await getTopVideos({
          from: addDays(today, -(ideasDays - 1)),
          to: today,
          projectId: ideasProjectId,
          role: 'creator',
          limit: ideasLimitN,
          sort: ideasSortMode,
          asOf: today,
        }).catch(() => [])
      : []
  const myRecentVideos =
    submitMode === 'mine' && creator.role === 'creator'
      ? await getSubmissionsForCreator(creator.id, {
          from: addDays(today, -29),
          to: today,
          limit: 100,
        }).catch(() => [])
      : []

  const dailyGoals = goalsForContract(creator, active)
  const goalShape = {
    goal_instagram: dailyGoals.goalInstagram,
    goal_tiktok: dailyGoals.goalTiktok,
  }
  // Always show Instagram + TikTok fields on the creator page.
  const fields = PLATFORMS.map((platform) => ({
    platform,
    goal: goalFor(goalShape, platform),
    todayCount: counts[platform],
  }))

  const activeCompare = comparisons.find((c) => c.isActive) ?? null
  const contractVideosPosted = activeCompare?.videoCount ?? 0
  const contractVideosTarget = activeCompare?.targetTotal ?? 0
  const contractVideosLeft =
    contractVideosTarget > 0 ? Math.max(0, contractVideosTarget - contractVideosPosted) : null
  const contractBonusSar = activeCommissionSheet?.earnedSar ?? 0
  const contractBonusRate =
    activeCommissionSheet?.commissionAmount != null &&
    activeCommissionSheet.viewsThreshold != null &&
    activeCommissionSheet.viewsThreshold > 0
      ? {
          amount: activeCommissionSheet.commissionAmount,
          threshold: activeCommissionSheet.viewsThreshold,
        }
      : null
  const displayStats = {
    ...stats,
    current_streak: consistency.currentStreak,
    best_streak: consistency.bestStreak,
    hit_rate: activeCompare?.displayRate ?? consistency.hitRate,
  }

  const defaultPanel = panel && ['contract', 'streaks', 'payments'].includes(panel) ? panel : null
  const previousComparisons = comparisons.filter((c) => !c.isActive)
  const renderContract = (row: (typeof comparisons)[number]) => {
    const {
      contract,
      isActive,
      manualHits,
      videoRate,
      displayRate,
      consistency,
    } = row
    const totalKind = manualHits ? t('hitTotal') : t('goalTotal')
    return (
      <div
        key={contract.id}
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">
            {isActive ? t('currentContract') : t('previousContract')} ·{' '}
            {contract.name}
          </h3>
          <span className="text-sm font-semibold tabular-nums">
            {Math.round(displayRate * 100)}%
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('from')} {formatDate(contract.start_date)} {t('to')}{' '}
          {contract.end_date
            ? formatDate(contract.end_date)
            : t('openEnded')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('platforms')}: {t('platformsBoth')}
          {' · '}
          {describeSchedule(scheduleFromContract(contract), locale)}
          {contract.end_date
            ? ` · ${t('contractEnds')} ${formatDate(contract.end_date)}`
            : ''}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-secondary/60 p-3">
            <div className="text-xs text-muted-foreground">
              {t('instagram')} ({totalKind})
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {manualHits ? (
                row.postedInstagram
              ) : (
                <>
                  {row.postedInstagram}
                  {contract.target_instagram > 0
                    ? ` / ${contract.target_instagram}`
                    : ''}
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('daily')}{' '}
              {contract.goal_instagram || dailyGoals.goalInstagram}
            </div>
          </div>
          <div className="rounded-lg bg-secondary/60 p-3">
            <div className="text-xs text-muted-foreground">
              {t('tiktok')} ({totalKind})
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {manualHits ? (
                row.postedTiktok
              ) : (
                <>
                  {row.postedTiktok}
                  {contract.target_tiktok > 0
                    ? ` / ${contract.target_tiktok}`
                    : ''}
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('daily')} {contract.goal_tiktok || dailyGoals.goalTiktok}
            </div>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {manualHits
            ? `${row.videoCount} ${t('videosHit')}`
            : videoRate != null
              ? `${t('videoProgress')} ${Math.round(videoRate * 100)}%${
                  row.videosComplete ? ` · ${t('videosComplete')}` : ''
                } · ${row.videoCount}${
                  row.targetTotal > 0 ? `/${row.targetTotal}` : ''
                } ${t('videosWord')}`
              : `${t('daysCommitment')} ${consistency.hitDays}/${consistency.requiredDays} · ${row.videoCount} ${t('videosWord')}`}
        </p>

        {row.projects.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {row.projects.map((p) => (
              <span
                key={p.projectId}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${projectToneClass(p.projectName)}`}
              >
                {p.projectName} {p.posted}
                {p.target > 0 ? `/${p.target}` : ''} {t('videosWord')}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-8">
        <div className="flex items-center justify-between gap-3">
          {leaderSession ? (
            <Link href="/leader" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
              {t('leaderTitle')}
            </Link>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <LanguageToggle
              locale={locale}
              labels={{ english: t('english'), arabic: t('arabic') }}
            />
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
            >
              <LogOut className="size-4" />
              {t('logOut')}
            </Link>
          </div>
        </div>

        <header className="animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-[#e8cfc0] dark:border-border bg-[#fff1e6] dark:bg-card p-6 text-[#9a0d18] dark:text-card-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-[#9a0d18] dark:text-card-foreground">
                {outreachWelcome ?? `${t('hey')} @${username}`}
              </p>
              {outreachHref ? (
                <Link href={outreachHref} className="mt-1 inline-block text-xs font-semibold underline">
                  Outreach
                </Link>
              ) : null}
              <p className="mt-0.5 text-xs text-[#a05a55] dark:text-muted-foreground">
                {login.platform === 'instagram' ? t('instagram') : t('tiktok')}
              </p>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight text-[#9a0d18] dark:text-card-foreground">
                {t('submitHeading')}
              </h1>
            </div>
            <div className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a] px-2 text-lg font-bold text-[#fff7f0]">
              {!homeProject ? 'نوتك · ميقات' : isMiqatHome ? 'ميقات' : 'نوتك'}
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[#b01020] dark:text-primary">
            {active
              ? `${active.name} · ${formatDate(active.start_date)}${
                  active.end_date ? ` → ${formatDate(active.end_date)}` : ` → ${t('openEnded')}`
                }`
              : t('submitToday')}
          </p>
        </header>

        {strikeSummary ? (
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
        ) : null}

        {creator.role === 'creator' && checkIn ? (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">
              {t('submitConsistencyTitle')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('submitConsistencyHint')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {checkIn.daysWithUs}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitDaysWithUs')}</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {checkIn.windowConsistencyPct}%
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t('submitWindowConsistency')}
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {checkIn.missDays}
                  {checkIn.onProbation ? (
                    <span className="text-sm font-normal text-muted-foreground"> / 10</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitMissDays')}</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {checkIn.streakLevel === 1
                    ? t('submitStreakFirst')
                    : checkIn.streakLevel === 2
                      ? t('submitStreakSecond')
                      : checkIn.streakLevel === 3
                        ? t('submitStreakFinal')
                        : t('submitStreakNone')}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitStreakLevel')}</div>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-medium text-muted-foreground">
              {t('submitConsistencyTarget')}
            </p>
          </section>
        ) : null}

        {creator.role === 'creator' && active ? (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">
              {t('submitContractTitle')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {active.name}
              {' · '}
              {formatDate(active.start_date)}
              {active.end_date ? ` → ${formatDate(active.end_date)}` : ` → ${t('openEnded')}`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-lg font-semibold tabular-nums text-[#0f7a3d] dark:text-emerald-300">
                  {formatMoney(contractBonusSar, 'SAR')}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitContractBonus')}</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatNumber(contractVideosPosted)}
                  {contractVideosTarget > 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / {formatNumber(contractVideosTarget)}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitContractPosted')}</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {contractVideosLeft != null ? formatNumber(contractVideosLeft) : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitContractLeft')}</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {activeCompare
                    ? `${Math.round((activeCompare.displayRate ?? 0) * 100)}%`
                    : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">{t('submitContractProgress')}</div>
              </div>
            </div>
            {(activeCompare &&
              (active.target_instagram > 0 || active.target_tiktok > 0)) ||
            contractBonusRate ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {activeCompare && active.target_instagram > 0 ? (
                  <span>
                    {t('instagram')}: {formatNumber(activeCompare.postedInstagram)} /{' '}
                    {formatNumber(active.target_instagram)}
                  </span>
                ) : null}
                {activeCompare && active.target_tiktok > 0 ? (
                  <span>
                    {t('tiktok')}: {formatNumber(activeCompare.postedTiktok)} /{' '}
                    {formatNumber(active.target_tiktok)}
                  </span>
                ) : null}
                {contractBonusRate ? (
                  <span>
                    {t('submitContractBonusRate')
                      .replace('{views}', formatNumber(contractBonusRate.threshold))
                      .replace('{amount}', formatMoney(contractBonusRate.amount, 'SAR'))}
                  </span>
                ) : (
                  <span>{t('submitContractBonusUnset')}</span>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t('submitContractBonusUnset')}
              </p>
            )}
          </section>
        ) : null}

        {creator.role === 'creator' ? (
          <SubmitModeToggle
            mode={submitMode}
            labels={{
              post: t('submitModePost'),
              ideas: t('submitModeIdeas'),
              mine: t('submitModeMine'),
            }}
          />
        ) : null}

        <div className="flex flex-col gap-4">
          {submitMode === 'ideas' && creator.role === 'creator' ? (
            <VideoIdeasPanel
              videos={ideaVideos}
              projects={ideaProjectOptions}
              lockedProjectId={ideasLockedProjectId}
              labels={{
                title: t('ideasTitle'),
                hint: t('ideasHint'),
                guideBox: t('ideasGuideBox'),
                highlySuggested: t('ideasHighlySuggested'),
                period30: t('ideasPeriod30'),
                period60: t('ideasPeriod60'),
                sortViews: t('ideasSortViews'),
                sortTrending: t('ideasSortTrending'),
                sortViewsHint: t('ideasSortViewsHint'),
                sortTrendingHint: t('ideasSortTrendingHint'),
                filterViewsLabel: t('ideasFilterViewsLabel'),
                filterTrendLabel: t('ideasFilterTrendLabel'),
                empty: t('ideasEmpty'),
                open: t('ideasOpen'),
                username: t('ideasUsername'),
                postedOn: t('ideasPostedOn'),
                project: t('ideasProject'),
                allProjects: t('allProjects'),
                pickProject: t('ideasPickProject'),
                topN: t('ideasTopN'),
                viewsWord: t('ideasViewsWord'),
                trendWord: t('ideasTrendWord'),
              }}
            />
          ) : submitMode === 'mine' && creator.role === 'creator' ? (
            <MyVideosPanel
              videos={myRecentVideos}
              labels={{
                title: t('mineTitle'),
                hint: t('mineHint'),
                empty: t('mineEmpty'),
                open: t('ideasOpen'),
                postedOn: t('ideasPostedOn'),
                project: t('ideasProject'),
                viewsWord: t('ideasViewsWord'),
              }}
            />
          ) : (
            <>
              <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card/40 p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">{t('addLinks')}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('submitPostHint')}</p>
                </div>
                <SubmitForm
                  username={username}
                  fields={fields}
                  projects={submitProjectOptions}
                  defaultProjectId={defaultSubmitProjectId}
                  videoDate={date}
                  defaultTime={defaultTime}
                  brandProjects={brandProjects}
                  dateLocked={onProbation}
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
                    postWhenHint: onProbation ? t('probationDateLocked') : t('submitTimeHint'),
                    dailyGoalLabel: t('submitDailyGoalLabel'),
                    stepLinks: t('submitStepLinks'),
                    stepWhen: t('submitStepWhen'),
                    nowLabel: t('submitNowLabel'),
                  }}
                />
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{t('todaysVideos')}</h2>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatDate(date)}</p>
                </div>
                {!isToday && !onProbation ? (
                  <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
                    {t('addingPast')}
                  </p>
                ) : null}
                <TodayVideos
                  username={username}
                  submissions={submissions}
                  locale={locale}
                  projects={projects}
                  changeProjectLabel={t('changeProject')}
                />
              </section>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t('creatorTapHint')}</p>

        <PanelBoard
          defaultOpen={defaultPanel}
          columns={2}
          closeLabel={t('close')}
          panels={[
            {
              id: 'contract',
              title: t('panelContract'),
              summary: active
                ? `${Math.round((activeCompare?.displayRate ?? consistency.hitRate) * 100)}%`
                : t('none'),
              hint: active?.name ?? t('noCurrentContract'),
              children: (
                <div className="flex flex-col gap-4">
                  {comparisons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('noCurrentContract')}</p>
                  ) : (
                    <>
                      {comparisons.filter((c) => c.isActive).map(renderContract)}
                      {previousComparisons.length > 0 ? (
                        <details className="rounded-xl border border-dashed border-border p-3">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                            {t('previousContracts')} ({previousComparisons.length})
                          </summary>
                          <div className="mt-3 flex flex-col gap-3">
                            {previousComparisons.map(renderContract)}
                          </div>
                        </details>
                      ) : null}
                    </>
                  )}
                </div>
              ),
            },
            {
              id: 'streaks',
              title: t('panelStreaks'),
              summary: `${consistency.currentStreak} ${t('days')}`,
              hint: `${Math.round((activeCompare?.displayRate ?? consistency.hitRate) * 100)}% ${t('commitment')}`,
              children: (
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-foreground">
                    {t('activitySummary')}
                  </h2>
                  {consistency.streakEpochStart && consistency.streakEpochEnd ? (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t('streakPeriod')}: {formatDate(consistency.streakEpochStart)} →{' '}
                      {formatDate(consistency.streakEpochEnd)}. {t('streakPeriodHint')}
                    </p>
                  ) : null}
                  <CreatorStats stats={displayStats} locale={locale} />
                </div>
              ),
            },
            {
              id: 'payments',
              title: t('panelPayments'),
              summary: formatMoney(paidTotal, payCurrency(creator.role, creator.pay_currency)),
              hint: myPayments[0]
                ? `${t('lastPaid')} ${formatDate(myPayments[0].paid_on)}`
                : paidTotal > 0
                  ? undefined
                  : t('paymentsNone'),
              children: (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">{t('paymentsCheckHint')}</p>
                  {myPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('paymentsNone')}</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {myPayments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span>
                            {formatDate(p.paid_on)}
                            {p.contract_name ? (
                              <span className="text-xs text-muted-foreground"> · {p.contract_name}</span>
                            ) : null}
                          </span>
                          <span className="font-semibold tabular-nums">{formatMoney(p.amount, payCurrency(creator.role, creator.pay_currency))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            },
          ]}
        />
      </main>
    </div>
  )
}
