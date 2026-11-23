import 'server-only'
import { addDays } from '@/lib/campaign'
import { revenueCatLinks, type RevenueCatLink } from '@/lib/revenuecat'

/**
 * The daily recovery view.
 *
 * Refund rate is far too noisy to read one day at a time at this volume
 * (~16 paid transactions a day, so one refund moves the rate ten points).
 * So the daily page shows a rolling 7-day rate against the 7 days before it.
 * Counts (refunds, requests, reasons) are still per day, because those are
 * what you act on.
 */

const API = 'https://api.revenuecat.com/v2'
const RATE_LOOKBACK_DAYS = 63
const REQUEST_LOOKBACK_DAYS = 56

export type RecoveryDay = { day: string; transactions: number; refunds: number }

export type RecoveryWindow = {
  days: number
  from: string
  to: string
  transactions: number
  refunds: number
  /** Percent, one decimal. Null when no paid transactions landed in the window. */
  rate: number | null
  /** Refund requests (not refunds) received in the window. */
  requests: number
}

export type RecoveryReason = {
  key: string
  label: string
  requests: number
  priorRequests: number
}

export type RecoveryApp = {
  appName: string
  /** 7-day rolling refund rate, oldest first. Drives the sparkline. */
  rolling: number[]
  last7: RecoveryWindow
  prior7: RecoveryWindow
  last28: RecoveryWindow
  prior28: RecoveryWindow
  /** Refund requests received today — the one number that changes daily. */
  todayRequests: number
  reasons: RecoveryReason[]
  error?: string
}

/**
 * Filled once the complaints site (reportprblm) is connected. Kept as one
 * shape so the panel can render dashes today and real numbers later without
 * changing the layout.
 */
export type RecoveryBacklog = {
  unresolvedComplaints: number
  complaintsOver24h: number
  medianResponseHours: number | null
  criticalBugs: number
  satisfaction: number | null
  satisfactionPrior: number | null
  source: string
}

export type RecoveryReport = {
  generatedAt: string
  apps: RecoveryApp[]
  backlog: RecoveryBacklog | null
}

type ChartPoint = {
  cohort?: unknown
  measure?: unknown
  value?: unknown
  segment?: unknown
  incomplete?: unknown
}

type Chart = {
  values?: unknown[]
  measures?: Array<{ display_name?: string }>
  segments?: Array<{ display_name?: string; is_total?: boolean }>
}

function dayOf(value: unknown): string | null {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    return new Date(ms).toISOString().slice(0, 10)
  }
  return null
}

function points(chart: Chart): ChartPoint[] {
  if (!Array.isArray(chart.values)) return []
  return chart.values.filter((v): v is ChartPoint => !!v && typeof v === 'object' && !Array.isArray(v))
}

/** Measures come back as an ordered list; match by name, fall back to position. */
function measureIndex(chart: Chart, preferred: string[], fallback: number | null): number | null {
  const names = (chart.measures ?? []).map((m) => (m.display_name ?? '').trim().toLowerCase())
  for (const want of preferred) {
    const i = names.indexOf(want.toLowerCase())
    if (i >= 0) return i
  }
  return fallback
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function rateOf(refunds: number, transactions: number): number | null {
  if (transactions <= 0) return null
  return round1((refunds / transactions) * 100)
}

async function rcChart(
  link: RevenueCatLink,
  chart: string,
  params: Record<string, string>,
): Promise<Chart> {
  const qs = new URLSearchParams(params).toString()
  const url = (id: string) => `${API}/projects/${id}/charts/${chart}?${qs}`
  const headers = { Authorization: `Bearer ${link.apiKey}`, Accept: 'application/json' }

  let res = await fetch(url(link.rcProjectId), {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 404 && !link.rcProjectId.startsWith('proj')) {
    res = await fetch(url(`proj${link.rcProjectId}`), {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  }

  const body = (await res.json().catch(() => null)) as (Chart & { message?: string }) | null
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`)
  return body ?? {}
}

function parseDailyRefunds(chart: Chart): Map<string, RecoveryDay> {
  const txIdx = measureIndex(chart, ['Transactions'], 0)
  const refundIdx = measureIndex(chart, ['Refunded Transactions'], 1)
  const out = new Map<string, RecoveryDay>()

  for (const point of points(chart)) {
    const day = dayOf(point.cohort)
    if (!day) continue
    const measure = typeof point.measure === 'number' ? point.measure : null
    const value = num(point.value)
    const row = out.get(day) ?? { day, transactions: 0, refunds: 0 }
    if (measure === txIdx) row.transactions = value
    else if (measure === refundIdx) row.refunds = value
    out.set(day, row)
  }
  return out
}

type RequestDay = { day: string; reason: string; count: number }

function humanReason(key: string): string {
  const known: Record<string, string> = {
    UNINTENDED_PURCHASE: 'Unintended purchase',
    UNSATISFIED_WITH_PURCHASE: 'Not satisfied with purchase',
  }
  if (known[key]) return known[key]
  const words = key.replace(/_/g, ' ').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The refund-request chart segments come back as "Outcome / Reason"
 * (e.g. "Approved / UNINTENDED_PURCHASE"). We only need the reason.
 */
function parseRequests(chart: Chart): RequestDay[] {
  const totalIdx = measureIndex(chart, ['Total Requests'], null)
  const segments = chart.segments ?? []
  const out: RequestDay[] = []
  // Without the "Total Requests" measure we cannot tell requests apart from
  // granted/declined rows, so count nothing rather than multiply-count.
  if (totalIdx == null) return out

  for (const point of points(chart)) {
    const day = dayOf(point.cohort)
    if (!day) continue
    const measure = typeof point.measure === 'number' ? point.measure : null
    if (measure != null && measure !== totalIdx) continue
    const count = num(point.value)
    if (count <= 0) continue

    const segIdx = typeof point.segment === 'number' ? point.segment : null
    if (segIdx == null) {
      out.push({ day, reason: 'UNSPECIFIED', count })
      continue
    }
    const seg = segments[segIdx]
    if (!seg) continue
    if (seg.is_total) continue
    const name = (seg.display_name ?? '').trim()
    if (!name || name.toLowerCase() === 'total') continue
    const slash = name.lastIndexOf('/')
    const reason = (slash >= 0 ? name.slice(slash + 1) : name).trim() || 'UNSPECIFIED'
    out.push({ day, reason, count })
  }
  return out
}

function buildWindow(opts: {
  daily: Map<string, RecoveryDay>
  requests: RequestDay[]
  from: string
  to: string
  days: number
}): RecoveryWindow {
  let transactions = 0
  let refunds = 0
  for (const row of opts.daily.values()) {
    if (row.day < opts.from || row.day > opts.to) continue
    transactions += row.transactions
    refunds += row.refunds
  }
  const requests = opts.requests
    .filter((r) => r.day >= opts.from && r.day <= opts.to)
    .reduce((sum, r) => sum + r.count, 0)
  return {
    days: opts.days,
    from: opts.from,
    to: opts.to,
    transactions,
    refunds,
    rate: rateOf(refunds, transactions),
    requests,
  }
}

function buildReasons(
  requests: RequestDay[],
  last28: { from: string; to: string },
  prior28: { from: string; to: string },
): RecoveryReason[] {
  const current = new Map<string, number>()
  const prior = new Map<string, number>()
  for (const request of requests) {
    if (request.day >= last28.from && request.day <= last28.to) {
      current.set(request.reason, (current.get(request.reason) ?? 0) + request.count)
    } else if (request.day >= prior28.from && request.day <= prior28.to) {
      prior.set(request.reason, (prior.get(request.reason) ?? 0) + request.count)
    }
  }
  const keys = new Set([...current.keys(), ...prior.keys()])
  return [...keys]
    .map((key) => ({
      key,
      label: humanReason(key),
      requests: current.get(key) ?? 0,
      priorRequests: prior.get(key) ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests || b.priorRequests - a.priorRequests)
    .slice(0, 6)
}

/** Rolling 7-day rate for each complete day in the series. */
function rollingSeven(daily: Map<string, RecoveryDay>, today: string, weeks: number): number[] {
  const days = [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
  const out: number[] = []
  const lastComplete = addDays(today, -1)
  for (let i = 6; i < days.length; i++) {
    const end = days[i].day
    if (end > lastComplete) break
    if (end < addDays(today, -(weeks * 7))) continue
    let tx = 0
    let refunds = 0
    for (let j = i - 6; j <= i; j++) {
      tx += days[j].transactions
      refunds += days[j].refunds
    }
    const rate = rateOf(refunds, tx)
    if (rate != null) out.push(rate)
  }
  return out
}

async function loadApp(link: RevenueCatLink, today: string): Promise<RecoveryApp> {
  const lastComplete = addDays(today, -1)
  const last7 = { from: addDays(lastComplete, -6), to: lastComplete, days: 7 }
  const prior7 = { from: addDays(lastComplete, -13), to: addDays(lastComplete, -7), days: 7 }
  const last28 = { from: addDays(lastComplete, -27), to: lastComplete, days: 28 }
  const prior28 = { from: addDays(lastComplete, -55), to: addDays(lastComplete, -28), days: 28 }

  const [rateChart, requestChart] = await Promise.all([
    rcChart(link, 'refund_rate', {
      resolution: '0',
      start_date: addDays(today, -RATE_LOOKBACK_DAYS),
      end_date: today,
      currency: 'USD',
    }),
    // Requests are the secondary half; a failure there should not blank the page.
    rcChart(link, 'refund_request', {
      resolution: '0',
      start_date: addDays(today, -REQUEST_LOOKBACK_DAYS),
      end_date: today,
      segment: 'refund_request_reason',
      selectors: JSON.stringify({ measure: 'request_count' }),
    }).catch((err) => {
      console.error(`[recovery] ${link.appName} refund requests`, err)
      return null
    }),
  ])

  const daily = parseDailyRefunds(rateChart)
  const requests = requestChart ? parseRequests(requestChart) : []

  return {
    appName: link.appName,
    rolling: rollingSeven(daily, today, 8),
    last7: buildWindow({ daily, requests, ...last7 }),
    prior7: buildWindow({ daily, requests, ...prior7 }),
    last28: buildWindow({ daily, requests, ...last28 }),
    prior28: buildWindow({ daily, requests, ...prior28 }),
    todayRequests: requests.filter((r) => r.day === today).reduce((sum, r) => sum + r.count, 0),
    reasons: buildReasons(requests, last28, prior28),
  }
}

export async function loadRecoveryReport(opts: { today: string }): Promise<RecoveryReport> {
  const links = revenueCatLinks()
  const apps = await Promise.all(
    links.map(async (link) => {
      try {
        return await loadApp(link, opts.today)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[recovery] ${link.appName}`, message)
        const empty = { days: 0, from: opts.today, to: opts.today, transactions: 0, refunds: 0, rate: null, requests: 0 }
        return {
          appName: link.appName,
          rolling: [],
          last7: { ...empty, days: 7 },
          prior7: { ...empty, days: 7 },
          last28: { ...empty, days: 28 },
          prior28: { ...empty, days: 28 },
          todayRequests: 0,
          reasons: [],
          error: message,
        } satisfies RecoveryApp
      }
    }),
  )

  return {
    generatedAt: new Date().toISOString(),
    apps,
    // reportprblm is not connected yet. Replace this with its numbers and the
    // panel fills itself in; no layout change needed.
    backlog: null,
  }
}
