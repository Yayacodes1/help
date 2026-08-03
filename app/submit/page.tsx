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
  getContractComparisons,
  getCreatorByName,
  getServerToday,
  getSubmissionsForCreatorOnDate,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getCreatorConsistency,
  getLatestPayment,
  getPaySummary,
  getPaymentsForCreator,
  getCreatorPaidTotal,
  goalsForContract,
} from '@/lib/queries'
import { PLATFORMS } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { yearRange } from '@/lib/campaign'
import { formatDate, formatMoney } from '@/lib/format'
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

  const username = creator.name
  const today = await getServerToday()
  const { start: rangeStart, end: rangeEnd } = yearRange(today)

  let date = isValidDate(dateParam) ? dateParam : today
  if (date < rangeStart) date = rangeStart
  if (date > rangeEnd) date = rangeEnd
  const isToday = date === today

  const [
    counts,
    submissions,
    stats,
    consistency,
    active,
    comparisons,
    latestPayment,
    pay,
    payments,
    paidTotal,
  ] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getCreatorStats(creator.id),
    getCreatorConsistency(creator, today),
    getActiveContract(creator.id, today),
    getContractComparisons(creator, today),
    getLatestPayment(creator.id),
    getPaySummary(creator, today),
    getPaymentsForCreator(creator.id),
    getCreatorPaidTotal(creator.id),
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
    panel && ['today', 'contract', 'pay', 'streaks'].includes(panel) ? panel : 'today'

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
                {t('welcome')} {creator.name}
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
                    <SubmitForm username={username} date={date} fields={fields} />
                  </section>

                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-foreground">{t('todaysVideos')}</h2>
                    <TodayVideos username={username} submissions={submissions} />
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
                          isPast,
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

                            <div className="mt-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
                              <p>
                                Base{' '}
                                <span className="font-semibold tabular-nums">
                                  {formatMoney(Number(contract.base_amount) || 0)}
                                </span>
                                {isActive && !isPast ? ` (${t('termsPay').toLowerCase()})` : ''}
                                {' · '}
                                Commission{' '}
                                <span className="font-semibold tabular-nums">
                                  {row.commissionMissing
                                    ? t('commissionMissing')
                                    : formatMoney(Number(contract.commission_amount))}
                                </span>
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {t('expectedPay')}:{' '}
                                <span className="font-medium text-foreground tabular-nums">
                                  {row.expectedTotal != null
                                    ? formatMoney(row.expectedTotal)
                                    : '—'}
                                </span>
                                {' · '}
                                {t('contractPaid')}:{' '}
                                <span className="font-medium text-foreground tabular-nums">
                                  {formatMoney(row.paidAmount)}
                                </span>
                                {row.balance > 0.009
                                  ? ` · ${t('stillDue')} ${formatMoney(row.balance)}`
                                  : ''}
                                {isActive && !isPast ? (
                                  <span className="mt-1 block text-xs">{t('inProgressTerms')}</span>
                                ) : null}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              ),
            },
            {
              id: 'pay',
              title: t('panelPay'),
              summary: formatMoney(paidTotal),
              hint: latestPayment
                ? `${t('lastPayment')} ${formatDate(latestPayment.paid_on)}`
                : pay.nextPayAt
                  ? `${t('nextExpectedPay')} ${formatDate(pay.nextPayAt)}`
                  : t('none'),
              children: (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{t('totalPaid')}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {formatMoney(paidTotal)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('paidFromPaymentsOnly')}
                    </p>
                    {latestPayment ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {t('lastPayment')}:{' '}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatMoney(latestPayment.amount)}
                        </span>
                        {' · '}
                        {formatDate(latestPayment.paid_on)}
                        {latestPayment.note ? ` · ${latestPayment.note}` : ''}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">{t('noPaymentYet')}</p>
                    )}
                    {pay.nextPayAt && (
                      <p className="mt-3 text-sm">
                        {t('nextExpectedPay')}:{' '}
                        <span className="font-medium">{formatDate(pay.nextPayAt)}</span>
                        {pay.isDue ? ` (${t('due')})` : ''}
                      </p>
                    )}
                    {active && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('currentContract')}: {active.name}
                        {' · '}
                        {active.end_date
                          ? `${t('contractEnds')} ${formatDate(active.end_date)}`
                          : t('openEnded')}
                      </p>
                    )}
                  </div>

                  {payments.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <h3 className="text-sm font-semibold">{t('paymentHistory')}</h3>
                      <ul className="mt-3 flex flex-col divide-y divide-border">
                        {payments.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                          >
                            <div>
                              <span className="font-semibold tabular-nums">
                                {formatMoney(p.amount)}
                              </span>
                              <span className="text-muted-foreground">
                                {' · '}
                                {formatDate(p.paid_on)}
                              </span>
                              {p.contract_name && (
                                <span className="text-muted-foreground">
                                  {' · '}
                                  {p.contract_name}
                                </span>
                              )}
                              {p.note && (
                                <p className="text-xs text-muted-foreground">{p.note}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
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
