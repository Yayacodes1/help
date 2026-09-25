import { Send } from 'lucide-react'
import { SubmitForm } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { DateSelect } from '@/components/date-select'
import { CreatorStats } from '@/components/creator-stats'
import { UsernameGate } from '@/components/username-gate'
import { PanelBoard } from '@/components/admin/panel-board'
import { LanguageToggle } from '@/components/language-toggle'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  getActiveContract,
  getAllProjects,
  getContractComparisons,
  getCreatorByName,
  getServerToday,
  getServerNowIso,
  getServerTimeHm,
  getSubmissionsForCreatorOnDate,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getCreatorConsistency,
  goalsForContract,
} from '@/lib/queries'
import { getLeagueBoard } from '@/lib/ranking'
import { RankingBoard } from '@/components/ranking-board'
import { ContestPodium } from '@/components/contest-podium'
import { CONTEST, isContestLive } from '@/lib/contest'
import { findMiyqatProject } from '@/lib/project-scope'
import { StrikeBanner } from '@/components/strike-banner'
import { operationalDayFromIso } from '@/lib/operational-day'
import { getCreatorStrikeSummary, syncReposterStrikes } from '@/lib/strikes'
import { loginHandleFor } from '@/lib/usernames'
import { PLATFORMS } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { yearRange } from '@/lib/campaign'
import { formatDate } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

function isValidDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; date?: string; panel?: string }>
}) {
  const { u, date: dateParam, panel } = await searchParams
  await ensureCreatorTrackingColumns()
  const locale = await getLocale()
  const t = createT(locale)
  const creator = u ? await getCreatorByName(u) : null

  if (!creator) {
    return <UsernameGate initialUsername={u ?? ''} locale={locale} />
  }

  const login = loginHandleFor(creator)
  const username = login.handle || creator.name
  const [calendarToday, serverNow, defaultTime] = await Promise.all([
    getServerToday(),
    getServerNowIso(),
    getServerTimeHm(),
  ])
  const opToday = operationalDayFromIso(serverNow)
  const today = creator.role === 'reposter' ? opToday : calendarToday
  if (creator.role === 'reposter') {
    await syncReposterStrikes({ today: opToday, creatorId: creator.id })
  }
  const { start: rangeStart, end: rangeEnd } = yearRange(calendarToday)

  let date = isValidDate(dateParam) ? dateParam : today
  if (date < rangeStart) date = rangeStart
  if (date > rangeEnd) date = rangeEnd
  const isToday = date === today

  const projects = await getAllProjects()
  const miqatId = findMiyqatProject(projects)?.id ?? null

  const [
    counts,
    submissions,
    stats,
    consistency,
    active,
    comparisons,
    league,
    contestBoard,
    strikeSummary,
  ] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getCreatorStats(creator.id),
    getCreatorConsistency(creator, today),
    getActiveContract(creator.id, today),
    getContractComparisons(creator, today),
    creator.role === 'reposter'
      ? getLeagueBoard({ role: 'reposter' })
      : Promise.resolve(null),
    creator.role === 'reposter' && isContestLive(calendarToday) && miqatId != null
      ? getLeagueBoard({
          role: 'reposter',
          from: CONTEST.from,
          to: CONTEST.to,
          projectId: miqatId,
        })
      : Promise.resolve(null),
    creator.role === 'reposter'
      ? getCreatorStrikeSummary(creator.id, opToday)
      : Promise.resolve(null),
  ])

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

  const activeCompare = comparisons.find((c) => c.isActive)
  const displayStats = {
    ...stats,
    current_streak: consistency.currentStreak,
    best_streak: consistency.bestStreak,
    hit_rate: activeCompare?.displayRate ?? consistency.hitRate,
  }

  const defaultPanel =
    panel && ['today', 'contract', 'streaks'].includes(panel) ? panel : 'today'

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-8">
        <div className="flex justify-end">
          <LanguageToggle
            locale={locale}
            labels={{ english: t('english'), arabic: t('arabic') }}
          />
        </div>

        <header className="animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-[#e8cfc0] bg-[#fff1e6] p-6 text-[#9a0d18] shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#a05a55]">
                {t('welcome')} @{username}
              </p>
              <p className="mt-0.5 text-xs text-[#a05a55]">
                {login.platform === 'instagram' ? t('instagram') : t('tiktok')}
              </p>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight text-[#9a0d18]">
                {t('submitHeading')}
              </h1>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a] text-lg font-bold text-[#fff7f0]">
              نوتك
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[#b01020]">
            {active
              ? `${active.name} · ${formatDate(active.start_date)}${
                  active.end_date ? ` → ${formatDate(active.end_date)}` : ` → ${t('openEnded')}`
                }`
              : t('submitToday')}
          </p>
          <p className="mt-1 text-xs text-[#a05a55]">{t('platformsBoth')}</p>
        </header>

        {strikeSummary ? (
          <StrikeBanner
            count={strikeSummary.contractStrikes}
            postedToday={strikeSummary.postedToday}
            labels={{
              none: t('strikeNone'),
              one: t('strikeYouHaveOne'),
              two: t('strikeYouHaveTwo'),
              three: t('strikeYouHaveThree'),
              posted: t('strikePostedToday'),
              missed: t('strikeMissedToday'),
              hint: t('strikesHint'),
            }}
          />
        ) : null}

        {creator.role === 'reposter' && (contestBoard || league) ? (
          <div className="flex flex-col gap-3">
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
              <div className="max-h-[30vh] overflow-auto rounded-2xl border border-border bg-card p-3 shadow-sm">
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
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">{t('creatorTapHint')}</p>

        <PanelBoard
          defaultOpen={defaultPanel}
          columns={2}
          closeLabel={t('close')}
          panels={[
            {
              id: 'today',
              title: t('panelToday'),
              summary: `${counts.instagram + counts.tiktok} ${t('videosWord')}`,
              hint: isToday ? t('submitToday') : formatDate(date),
              children: (
                <div className="flex flex-col gap-4">
                  <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">{t('chooseDay')}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t('chooseDayHint')}</p>
                      </div>
                      <DateSelect date={date} min={rangeStart} max={rangeEnd} />
                    </div>
                    {!isToday && (
                      <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
                        {t('addingPast')}
                      </p>
                    )}
                  </section>

                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">{t('addLinks')}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('platforms')}: {t('platformsBoth')}
                      {' · '}
                      {t('dailyGoal')}: {t('instagram')} {dailyGoals.goalInstagram}
                      {' · '}
                      {t('tiktok')} {dailyGoals.goalTiktok}
                    </p>
                    <SubmitForm
                      key={`${date}-${defaultTime}`}
                      username={username}
                      fields={fields}
                      projects={projects}
                      defaultProjectId={creator.project_id}
                      videoDate={date}
                      defaultTime={defaultTime}
                      labels={{
                        pasteLinks: t('pasteLinks'),
                        pasteHint: t('pasteLinksHint'),
                        send: t('submitVideos'),
                        sending: '…',
                        project: t('submitProject'),
                        projectHint: t('submitProjectHint'),
                        pickProject: t('pickProject'),
                        postDate: t('postDate'),
                        postTime: t('postTime'),
                        postWhenHint: t('submitTimeHint'),
                      }}
                    />
                  </section>

                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-foreground">{t('todaysVideos')}</h2>
                    <TodayVideos
                      username={username}
                      submissions={submissions}
                      locale={locale}
                    />
                  </section>
                </div>
              ),
            },
            {
              id: 'contract',
              title: t('panelContract'),
              summary: activeCompare
                ? `${Math.round(activeCompare.displayRate * 100)}%`
                : t('none'),
              hint: active?.name ?? t('noCurrentContract'),
              children: (
                <div className="flex flex-col gap-4">
                  {comparisons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('noCurrentContract')}</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">{t('allContracts')}</p>
                      {comparisons.map((row) => {
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
                          </div>
                        )
                      })}
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
          ]}
        />
      </main>
    </div>
  )
}
