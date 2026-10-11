import type { ContractCompareRow } from '@/lib/queries'
import type { ScheduleBreak } from '@/lib/db'
import type { CommissionContractSheet, CommissionOutsideSheet } from '@/lib/commission-data'
import { describeSchedule, scheduleFromContract } from '@/lib/posting-schedule'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { createT, type Locale } from '@/lib/i18n'
import { cadenceLabel, viewsBonusLine } from '@/lib/leader-portal'
import { projectToneClass } from '@/lib/project-scope'

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Contract terms and money, read-only: the leader sees them, only the admin edits them. */
export function ContractsView({
  comparisons,
  breaks,
  currency,
  locale,
}: {
  comparisons: ContractCompareRow[]
  breaks: ScheduleBreak[]
  currency: 'USD' | 'SAR'
  locale: Locale
}) {
  const t = createT(locale)
  const money = (n: number) => formatMoney(n, currency)
  const ordered = [...comparisons].sort((a, b) => Number(b.isActive) - Number(a.isActive))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('leaderPayHidden')}</p>
      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('leaderNoContracts')}
        </p>
      ) : (
        ordered.map((row) => {
          const { contract } = row
          const base = Number(contract.base_amount) || 0
          const viewsBonus = viewsBonusLine(t, contract)
          return (
            <section key={contract.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {row.isActive ? t('currentContract') : t('previousContract')} · {contract.name}
                </h3>
                <span className="text-sm font-semibold tabular-nums">{Math.round(row.displayRate * 100)}%</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(contract.start_date)} → {contract.end_date ? formatDate(contract.end_date) : t('openEnded')}
                {' · '}
                {describeSchedule(scheduleFromContract(contract), locale)}
              </p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile
                  label={t('instagram')}
                  value={`${row.postedInstagram}${contract.target_instagram > 0 ? ` / ${contract.target_instagram}` : ''}`}
                  hint={`${t('daily')} ${contract.goal_instagram}`}
                />
                <Tile
                  label={t('tiktok')}
                  value={`${row.postedTiktok}${contract.target_tiktok > 0 ? ` / ${contract.target_tiktok}` : ''}`}
                  hint={`${t('daily')} ${contract.goal_tiktok}`}
                />
                <Tile
                  label={t('videoProgress')}
                  value={row.videoRate != null ? `${Math.round(row.videoRate * 100)}%` : '—'}
                  hint={`${row.videoCount}${row.targetTotal > 0 ? `/${row.targetTotal}` : ''} ${t('videos').toLowerCase()}`}
                />
                <Tile
                  label={t('consistency')}
                  value={`${Math.round(row.consistency.hitRate * 100)}%`}
                  hint={`${row.consistency.hitDays}/${row.consistency.requiredDays} · ${row.consistency.missDays}✗`}
                />
              </div>

              {row.projects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {row.projects.map((p) => (
                    <span
                      key={p.projectId}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${projectToneClass(p.projectName)}`}
                    >
                      {p.projectName} {p.posted}
                      {p.target > 0 ? `/${p.target}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile
                  label={t('leaderAgreed')}
                  value={money(base)}
                  hint={`${t('leaderBase')} · ${cadenceLabel(t, contract)}`}
                />
                <Tile
                  label={t('leaderPeriodTotal')}
                  value={row.expectedTotal != null ? money(row.expectedTotal) : '—'}
                />
                <Tile label={t('totalPaid')} value={money(row.paidAmount)} />
                <Tile
                  label={t('stillDue')}
                  value={row.balance > 0.009 ? money(row.balance) : t('leaderSettled')}
                />
              </div>

              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('leaderBonus')}</p>
                <p className="mt-1">
                  {t('leaderBonusFlat')}:{' '}
                  <span className="font-medium tabular-nums">
                    {contract.commission_amount != null ? money(Number(contract.commission_amount)) : '—'}
                  </span>
                </p>
                <p>
                  {t('leaderBonusViews')}: <span className="font-medium tabular-nums">{viewsBonus ?? '—'}</span>
                </p>
              </div>

              {row.halves.length === 2 ? (
                <ul className="grid gap-2 text-xs sm:grid-cols-2">
                  {row.halves.map((half, i) => (
                    <li key={half.start} className="rounded-lg border border-border p-2 tabular-nums">
                      <p className="font-semibold">
                        {i === 0 ? t('leaderHalf1') : t('leaderHalf2')} · {formatDate(half.start)} →{' '}
                        {formatDate(half.end)}
                      </p>
                      <p className="text-muted-foreground">
                        {half.videoCount} {t('videos').toLowerCase()} · {t('totalPaid')} {money(half.paidAmount)}
                        {half.balance > 0.009 ? ` · ${t('stillDue')} ${money(half.balance)}` : ` · ${t('leaderSettled')}`}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          )
        })
      )}

      {breaks.length > 0 ? (
        <section className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold">{t('leaderBreaks')}</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {breaks.map((b) => (
              <li key={b.id} className="tabular-nums">
                {formatDate(b.start_date)} → {formatDate(b.end_date)}
                {b.reason ? <span className="text-muted-foreground"> · {b.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** Views bonus per contract period, read-only. */
export function BonusView({
  sheets,
  outside,
  locale,
}: {
  sheets: CommissionContractSheet[]
  outside: CommissionOutsideSheet
  locale: Locale
}) {
  const t = createT(locale)
  const ordered = [...sheets].reverse().sort((a, b) => Number(b.isActive) - Number(a.isActive))
  if (ordered.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t('leaderNoContracts')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {ordered.map((sheet) => {
        const qualified = sheet.videos.filter((v) => v.chunks > 0)
        const rate = viewsBonusLine(t, {
          view_commission_amount: sheet.commissionAmount,
          views_threshold: sheet.viewsThreshold,
        })
        return (
          <section key={sheet.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                {sheet.name}
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {formatDate(sheet.startDate)} → {sheet.endDate ? formatDate(sheet.endDate) : t('openEnded')}
                </span>
              </h3>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(sheet.earnedSar, 'SAR')}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {rate ?? '—'} · {qualified.length} {t('videos').toLowerCase()}
              {sheet.paidOn
                ? ` · ${t('totalPaid')} ${formatMoney(sheet.paidAmount ?? 0, 'SAR')} (${formatDate(sheet.paidOn)})`
                : sheet.earnedSar > 0
                  ? ` · ${t('leaderBonusUnpaid')}`
                  : ''}
            </p>
            {qualified.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium">{t('leaderQualified')}</summary>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {qualified.map((video) => (
                    <li key={video.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        {video.videoDate ? formatDate(video.videoDate) : '—'} ·{' '}
                        {video.platform === 'instagram' ? 'IG' : 'TT'} · {formatNumber(video.views)} {t('views')}
                        {video.url ? (
                          <>
                            {' · '}
                            <a href={video.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                              ↗
                            </a>
                          </>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(video.sar, 'SAR')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        )
      })}
      {outside.approvedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          + {outside.approvedCount} {t('videos').toLowerCase()} · {formatMoney(outside.earnedSar, 'SAR')}
        </p>
      ) : null}
    </div>
  )
}
