import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckForm } from '@/components/leader/check-form'
import { BreakRequestForm } from '@/components/leader/break-request-form'
import { CopyTextButton } from '@/components/leader/copy-text-button'
import { BonusView, ContractsView } from '@/components/leader/contracts-view'
import { ConsistencyCalendar } from '@/components/admin/consistency-calendar'
import { PanelBoard, type PanelItem } from '@/components/admin/panel-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { PersonHandlesLine } from '@/components/person-handles'
import { StatCard } from '@/components/stat-card'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderBoard, getLeaderScope } from '@/lib/leaders'
import { getTeamMembers, personReportLines } from '@/lib/leader-portal'
import {
  getActiveContract,
  getContractComparisons,
  getCreatorById,
  getCreatorConsistency,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getOperationalToday,
  getPaymentsForCreator,
  getProjectById,
  getScheduleBreaks,
  getServerToday,
  getSubmissionsForCreator,
  goalsForContract,
} from '@/lib/queries'
import { getCreatorCommissionSheets } from '@/lib/commission-data'
import { listBreakRequests } from '@/lib/break-requests'
import { getCreatorStrikeSummary } from '@/lib/strikes'
import { formatDate, formatMoney, formatNumber, payCurrency } from '@/lib/format'
import { getLocale } from '@/lib/locale'
import { createT } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

const LEADER_REFRESH = '/api/leader/refresh-views'
const PANELS = ['check', 'consistency', 'strikes', 'contracts', 'breakRequest', 'bonus', 'payments', 'videos']

export default async function LeaderCreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ panel?: string }>
}) {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  const [{ id: raw }, sp] = await Promise.all([params, searchParams])
  const id = Number(raw)
  if (!Number.isFinite(id)) notFound()

  const scope = await getLeaderScope(session.id)
  if (!scope.videoIds.includes(id)) notFound()
  const creator = await getCreatorById(id)
  if (!creator) notFound()

  const [locale, today, opToday] = await Promise.all([getLocale(), getServerToday(), getOperationalToday()])
  const t = createT(locale)
  const currency = payCurrency(creator.role, creator.pay_currency)

  const [
    board,
    counts,
    stats,
    consistency,
    active,
    comparisons,
    breaks,
    payments,
    submissions,
    commission,
    strikeSummary,
    project,
    member,
    breakRequests,
  ] = await Promise.all([
    getLeaderBoard(opToday),
    getCreatorCountsByPlatformOnDate(id, opToday),
    getCreatorStats(id),
    getCreatorConsistency(creator, today),
    getActiveContract(id, today),
    getContractComparisons(creator, today),
    getScheduleBreaks(id),
    getPaymentsForCreator(id),
    getSubmissionsForCreator(id),
    getCreatorCommissionSheets(id, today),
    creator.role === 'reposter' ? getCreatorStrikeSummary(id, opToday) : Promise.resolve(null),
    creator.project_id ? getProjectById(creator.project_id) : Promise.resolve(null),
    getTeamMembers([id], today, { withMoney: true }).then((rows) => rows[0] ?? null),
    listBreakRequests({ leaderId: session.id }),
  ])
  const person = board.leaders.find((row) => row.leaderId === session.id)?.people.find((p) => p.id === id) ?? null
  const goals = goalsForContract(creator, active)
  const activeCompare = comparisons.find((c) => c.isActive) ?? null
  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  const bonusEarned =
    commission.sheets.reduce((sum, s) => sum + s.earnedSar, 0) + commission.outside.earnedSar
  const report = member ? personReportLines(t, member).join('\n') : ''
  const defaultPanel = sp.panel && PANELS.includes(sp.panel) ? sp.panel : null

  const panels: PanelItem[] = []
  if (person) {
    panels.push({
      id: 'check',
      title: t('leaderDailyCheck'),
      summary: person.checked ? '✓' : '○',
      hint: opToday,
      children: (
        <CheckForm
          creatorId={id}
          day={opToday}
          checked={person.checked}
          note={person.note}
          markLabel={t('leaderMark')}
          undoLabel={t('leaderUndo')}
          saveLabel={t('leaderSaveNote')}
          notePlaceholder={t('leaderNotePh')}
        />
      ),
    })
  }
  panels.push({
    id: 'consistency',
    title: t('consistency'),
    summary: `${Math.round(consistency.hitRate * 100)}%`,
    hint: active ? active.name : undefined,
    children: (
      <div>
        {consistency.streakEpochStart && consistency.streakEpochEnd ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {t('streakPeriod')}: {formatDate(consistency.streakEpochStart)} → {formatDate(consistency.streakEpochEnd)}.{' '}
            {t('streakPeriodHint')}
          </p>
        ) : null}
        <ConsistencyCalendar days={consistency.days} />
        <p className="mt-3 text-xs text-muted-foreground">
          {t('daysHit')} {consistency.hitDays}/{consistency.requiredDays} · {t('leaderMissed')} {consistency.missDays} ·{' '}
          {t('leaderPartial')} {consistency.partialDays} · {t('currentStreak')} {consistency.currentStreak} ·{' '}
          {t('bestStreak')} {consistency.bestStreak}
        </p>
      </div>
    ),
  })
  if (strikeSummary) {
    panels.push({
      id: 'strikes',
      title: t('leaderStrikes'),
      summary: `${strikeSummary.contractStrikes}/${strikeSummary.maxStrikes}`,
      hint: strikeSummary.needsCorrective
        ? t('strikesCorrectiveFlag')
        : strikeSummary.postedToday
          ? t('strikePostedToday')
          : strikeSummary.offToday
            ? t('strikeOffToday')
            : t('strikeMissedToday'),
      children: (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('leaderStrikeLog')}</h3>
          {strikeSummary.strikes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('leaderNoStrikes')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {strikeSummary.strikes.map((strike) => (
                <li key={strike.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                  <span className={strike.status === 'waived' ? 'text-muted-foreground line-through' : ''}>
                    {formatDate(strike.strike_date)}
                    {strike.reason ? <span className="text-muted-foreground"> · {strike.reason}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{strike.source}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    })
  }
  panels.push(
    {
      id: 'contracts',
      title: t('contracts'),
      summary: activeCompare
        ? activeCompare.balance > 0.009
          ? formatMoney(activeCompare.balance, currency)
          : t('leaderSettled')
        : t('noContractSet'),
      hint: active ? `${active.name} · ${t('stillDue')}` : undefined,
      children: <ContractsView comparisons={comparisons} breaks={breaks} currency={currency} locale={locale} />,
    },
  )
  if (scope.teamIds.includes(id) && !creator.paused_at) {
    const forPerson = breakRequests.filter((r) => r.creator_id === id)
    panels.push({
      id: 'breakRequest',
      title: t('breakRequestTitle'),
      summary: `${forPerson.filter((r) => r.status === 'pending' || (r.status === 'approved' && !r.applied_at)).length}`,
      hint: t('breakRequestHint'),
      children: (
        <BreakRequestForm
          today={today}
          defaultCreatorId={id}
          people={[
            {
              id: creator.id,
              name: creator.name,
              role: creator.role === 'reposter' ? 'reposter' : 'creator',
              paused: false,
            },
          ]}
          requests={forPerson}
          labels={{
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
          }}
        />
      ),
    })
  }
  panels.push(
    {
      id: 'bonus',
      title: t('leaderBonus'),
      summary: formatMoney(bonusEarned, 'SAR'),
      hint: t('leaderBonusEarned'),
      children: <BonusView sheets={commission.sheets} outside={commission.outside} locale={locale} />,
    },
    {
      id: 'payments',
      title: t('payments'),
      summary: formatMoney(paidTotal, currency),
      hint: payments[0] ? `${t('lastPaid')} ${formatDate(payments[0].paid_on)}` : t('none'),
      children:
        payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  {formatDate(p.paid_on)}
                  {p.contract_name ? <span className="text-xs text-muted-foreground"> · {p.contract_name}</span> : null}
                  {p.note ? <span className="text-xs text-muted-foreground"> · {p.note}</span> : null}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(p.amount, currency)}</span>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: 'videos',
      title: t('videos'),
      summary: `${stats.total_videos}`,
      hint: `IG ${stats.instagram_videos} · TT ${stats.tiktok_videos} · ${formatNumber(totalViews)} ${t('views')}`,
      children: (
        <div className="flex flex-col gap-3">
          <Suspense fallback={<p className="text-xs text-muted-foreground">…</p>}>
            <RefreshViewsButton label={t('refreshViews')} creatorId={id} allDates endpoint={LEADER_REFRESH} />
          </Suspense>
          <SubmissionsTable
            submissions={submissions.map((s) => ({ ...s, creator_name: creator.name }))}
            emptyLabel={t('noVideosYet')}
            showCreator={false}
            editableViews={false}
            linkScope="leader"
            refreshEndpoint={LEADER_REFRESH}
            refreshLabel={t('refreshThisVideo')}
          />
        </div>
      ),
    },
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <Link
            href="/leader?tab=team"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            ← {t('leaderTabTeam')}
          </Link>
          <h2 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {creator.name}
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {creator.role === 'reposter' ? t('reposterRole') : t('creatorRole')}
            </span>
            {creator.paused_at ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {t('leaderPaused')}
              </span>
            ) : null}
          </h2>
          <PersonHandlesLine person={creator} className="mt-1 text-sm text-muted-foreground" />
          <p className="mt-1 text-sm text-muted-foreground">
            {project?.name ?? t('bothProjects')}
            {active
              ? ` · ${active.name}: ${formatDate(active.start_date)} → ${
                  active.end_date ? formatDate(active.end_date) : t('openEnded')
                }`
              : ` · ${t('noContractSet')}`}
          </p>
          <p className="mt-2 text-sm tabular-nums">
            {t('today')}: {t('instagram')} {counts.instagram}/{goals.goalInstagram} · {t('tiktok')} {counts.tiktok}/
            {goals.goalTiktok}
          </p>
        </div>
        {report ? (
          <CopyTextButton text={report} label={t('leaderCopyReport')} copiedLabel={t('leaderCopied')} />
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('currentStreak')} value={`${consistency.currentStreak} ${t('days')}`} />
        <StatCard label={t('hitRate')} value={`${Math.round(consistency.hitRate * 100)}%`} />
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
        <StatCard label={t('views')} value={formatNumber(member?.monthViews ?? 0)} hint={t('leaderMonthViews')} />
        <StatCard
          label={t('leaderAgreed')}
          value={active ? formatMoney(Number(active.base_amount) || 0, currency) : '—'}
          hint={
            activeCompare
              ? activeCompare.balance > 0.009
                ? `${t('stillDue')} ${formatMoney(activeCompare.balance, currency)}`
                : t('leaderSettled')
              : undefined
          }
        />
        <StatCard label={t('leaderBonusEarned')} value={formatMoney(bonusEarned, 'SAR')} />
      </section>

      {creator.notes ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">{t('notes')}: </span>
          {creator.notes}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t('tapSection')}</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
        <PanelBoard defaultOpen={defaultPanel} columns={3} closeLabel={t('close')} panels={panels} />
      </Suspense>
    </div>
  )
}
