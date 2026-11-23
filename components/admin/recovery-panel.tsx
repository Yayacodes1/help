import type { ReactNode } from 'react'
import type { RecoveryApp, RecoveryReport, RecoveryReason, RecoveryWindow } from '@/lib/recovery'

export type RecoveryLabels = {
  refundRate: string
  last7: string
  prior7: string
  refunds: string
  requests: string
  reasons: string
  reasonsEmpty: string
  better: string
  worse: string
  flat: string
  sparkline: string
  lateNote: string
  backlog: string
  unresolved: string
  over24h: string
  response: string
  criticalBugs: string
  satisfaction: string
  notConnected: string
  noConfig: string
  failed: string
  last28: string
  prior28: string
  today: string
  requestsToday: string
  noRequestsToday: string
  pts: string
  transactions: string
}

function pct(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

function deltaPoints(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null
  return Math.round((current - prior) * 10) / 10
}

/** Lower is better for every number on this panel except satisfaction. */
function Delta({
  value,
  labels,
  suffix,
  tolerance = 0,
  lowerIsBetter = true,
}: {
  value: number | null
  labels: RecoveryLabels
  suffix?: string
  /** Movement smaller than this is not a signal (one refund's worth, in points). */
  tolerance?: number
  lowerIsBetter?: boolean
}) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  if (Math.abs(value) <= Math.max(tolerance, 0.05)) {
    return <span className="text-xs text-muted-foreground">→ {labels.flat}</span>
  }
  const improving = lowerIsBetter ? value < 0 : value > 0
  const arrow = value < 0 ? '↓' : '↑'
  return (
    <span className={`text-xs font-medium ${improving ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {Math.abs(value) === Math.round(Math.abs(value)) ? Math.abs(value) : Math.abs(value).toFixed(1)}
      {suffix ? ` ${suffix}` : ''} {improving ? labels.better : labels.worse}
    </span>
  )
}

/** One refund's worth of rate movement — below this the change is noise. */
function oneRefund(transactions: number): number {
  return transactions > 0 ? Math.min(5, 100 / transactions) : 0
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const width = 100
  const height = 30
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (width - pad * 2) / (values.length - 1)
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span)
  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ')
  const lastX = pad + (values.length - 1) * step
  const lastY = y(values[values.length - 1])

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="text-sky-600 dark:text-sky-400"
        />
        <circle cx={lastX} cy={lastY} r={1.6} className="fill-sky-600 dark:fill-sky-400" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{label}</span>
        <span>
          {min.toFixed(0)}–{max.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  delta,
}: {
  label: string
  value: string
  hint?: string
  delta?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <div className="mt-0.5">{delta ?? (hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null)}</div>
    </div>
  )
}

function windowRange(w: RecoveryWindow): string {
  return `${w.from.slice(5)} → ${w.to.slice(5)}`
}

function ReasonRows({ reasons, labels }: { reasons: RecoveryReason[]; labels: RecoveryLabels }) {
  if (reasons.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.reasonsEmpty}</p>
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {reasons.map((reason) => {
        const delta = reason.requests - reason.priorRequests
        return (
          <li key={reason.key} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">{reason.label}</span>
            <span className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="font-medium">{reason.requests}</span>
              <span className="text-xs text-muted-foreground">
                {labels.prior28} {reason.priorRequests}
              </span>
              <Delta value={delta} labels={labels} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function AppBlock({ app, labels }: { app: RecoveryApp; labels: RecoveryLabels }) {
  const rateDelta = deltaPoints(app.last7.rate, app.prior7.rate)
  const monthDelta = deltaPoints(app.last28.rate, app.prior28.rate)
  const requestDelta = app.last7.requests - app.prior7.requests

  return (
    <section className="mt-6 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{app.appName}</h3>
        <p className="text-xs text-muted-foreground">
          {labels.last7}: {windowRange(app.last7)}
        </p>
      </div>

      {app.error ? (
        <p className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {labels.failed} {app.error}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{labels.today}:</span>{' '}
            {app.todayRequests > 0 ? (
              <span className="text-foreground">
                {app.todayRequests} {labels.requestsToday}
              </span>
            ) : (
              <span className="text-muted-foreground">{labels.noRequestsToday}</span>
            )}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              label={labels.refundRate}
              value={pct(app.last7.rate)}
              delta={
                <div className="flex flex-col gap-0.5">
                  <Delta
                    value={rateDelta}
                    labels={labels}
                    suffix={labels.pts}
                    tolerance={oneRefund(Math.min(app.last7.transactions, app.prior7.transactions))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {labels.prior7} {pct(app.prior7.rate)}
                  </span>
                </div>
              }
            />
            <Tile
              label={labels.refunds}
              value={`${app.last7.refunds} / ${app.last7.transactions}`}
              hint={labels.transactions}
            />
            <Tile
              label={labels.requests}
              value={String(app.last7.requests)}
              delta={
                <div className="flex flex-col gap-0.5">
                  <Delta value={requestDelta} labels={labels} />
                  <span className="text-xs text-muted-foreground">
                    {labels.prior7} {app.prior7.requests}
                  </span>
                </div>
              }
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {labels.last28}: <span className="font-medium text-foreground">{pct(app.last28.rate)}</span>
            </span>
            <Delta
              value={monthDelta}
              labels={labels}
              suffix={labels.pts}
              tolerance={oneRefund(Math.min(app.last28.transactions, app.prior28.transactions))}
            />
            <span className="text-muted-foreground">
              {labels.prior28} {pct(app.prior28.rate)}
            </span>
          </div>

          <Sparkline values={app.rolling} label={labels.sparkline} />

          <div className="mt-5">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">{labels.reasons}</h4>
              <p className="text-xs text-muted-foreground">
                {labels.last28}: {windowRange(app.last28)}
              </p>
            </div>
            <ReasonRows reasons={app.reasons} labels={labels} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">{labels.lateNote}</p>
        </>
      )}
    </section>
  )
}

function BacklogRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </div>
  )
}

export function RecoveryPanel({
  report,
  labels,
}: {
  report: RecoveryReport
  labels: RecoveryLabels
}) {
  const backlog = report.backlog

  return (
    <div>
      {report.apps.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {labels.noConfig}
        </p>
      ) : (
        report.apps.map((app) => <AppBlock key={app.appName} app={app} labels={labels} />)
      )}

      <section className="mt-8 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">{labels.backlog}</h3>
        <div className="mt-2 divide-y divide-border">
          <BacklogRow
            label={labels.unresolved}
            value={backlog ? String(backlog.unresolvedComplaints) : '—'}
          />
          <BacklogRow
            label={labels.over24h}
            value={backlog ? String(backlog.complaintsOver24h) : '—'}
          />
          <BacklogRow
            label={labels.response}
            value={
              backlog?.medianResponseHours == null ? '—' : `${backlog.medianResponseHours} h`
            }
          />
          <BacklogRow
            label={labels.criticalBugs}
            value={backlog ? String(backlog.criticalBugs) : '—'}
          />
          <BacklogRow
            label={labels.satisfaction}
            value={
              backlog?.satisfaction == null
                ? '—'
                : backlog.satisfactionPrior == null
                  ? String(backlog.satisfaction)
                  : `${backlog.satisfaction} (${labels.prior28} ${backlog.satisfactionPrior})`
            }
          />
        </div>
        {backlog ? null : (
          <p className="mt-3 text-xs text-muted-foreground">{labels.notConnected}</p>
        )}
      </section>
    </div>
  )
}
