'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDays, rankingMonthRange } from '@/lib/campaign'
import { shiftYearMonth } from '@/lib/biweekly'
import { formatNumber } from '@/lib/format'
import type { DailyDownloadsRow, SheetDayVideo, SheetRow } from '@/lib/analytics'
import {
  loadSheetDay,
  loadSheetPerson,
  saveDailyDownloads,
  syncRevenueCatNow,
} from '@/app/actions/downloads'

const IG = '#E1306C'
const TT = '#0F766E'
const CREATOR = '#6366F1'
const REPOSTER = '#F59E0B'
const DOWNLOADS = '#94A3B8'
const SUBS = '#10B981'
const REVENUE = '#8B5CF6'

type ChartMode = 'views' | 'ratios'

type ImpactSort =
  | 'views'
  | 'dlLift'
  | 'subLift'
  | 'estDl'
  | 'estSubs'
  | 'per1k'
  | 'nextDay'
  | 'spikes'
  | 'r'

function money(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ratio(num: number, den: number, scale = 1): number | null {
  return den > 0 ? (num / den) * scale : null
}

function fmtRatio(v: number | null, digits = 1): string {
  return v == null ? '—' : v.toFixed(digits)
}

/** Value at the given percentile (0–1) of a list. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

type Tab = 'day' | 'person' | 'impact'
type RoleView = 'all' | 'creator' | 'reposter'

type DayAgg = {
  ttVideos: number
  igVideos: number
  creatorVideos: number
  reposterVideos: number
  ttViews: number
  igViews: number
  creatorViews: number
  reposterViews: number
  views: number
  videos: number
}

type PersonAgg = {
  id: number
  name: string
  role: 'creator' | 'reposter'
  ttVideos: number
  igVideos: number
  ttViews: number
  igViews: number
  views: number
  videos: number
  byDate: Map<string, { views: number; videos: number }>
}

function emptyDay(): DayAgg {
  return {
    ttVideos: 0,
    igVideos: 0,
    creatorVideos: 0,
    reposterVideos: 0,
    ttViews: 0,
    igViews: 0,
    creatorViews: 0,
    reposterViews: 0,
    views: 0,
    videos: 0,
  }
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  if (!from || !to || from > to) return out
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function monthName(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

function strengthLabel(r: number | null): { text: string; className: string } {
  if (r == null) return { text: 'Not enough data', className: 'text-muted-foreground' }
  const a = Math.abs(r)
  const dir = r >= 0 ? '' : ' (opposite)'
  if (a >= 0.6) return { text: `Strong${dir}`, className: r >= 0 ? 'text-emerald-600' : 'text-red-600' }
  if (a >= 0.3) return { text: `Moderate${dir}`, className: r >= 0 ? 'text-emerald-500' : 'text-red-500' }
  return { text: 'Weak / none', className: 'text-muted-foreground' }
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadFile(name: string, headers: string[], lines: Array<Array<string | number>>) {
  const text = [headers, ...lines].map((l) => l.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Accepts lines like `2026-09-01, 120` or `09/01/2026\t120`. */
function parsePastedDownloads(text: string): Array<{ date: string; downloads: number }> {
  const out: Array<{ date: string; downloads: number }> = []
  for (const line of text.split(/\r?\n/)) {
    const iso = line.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\D+([\d,.\s]+)/)
    const us = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+([\d,.\s]+)/)
    let date = ''
    let raw = ''
    if (iso) {
      date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
      raw = iso[4]
    } else if (us) {
      date = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
      raw = us[4]
    } else continue
    const n = Number(raw.replace(/[,\s]/g, ''))
    if (Number.isFinite(n)) out.push({ date, downloads: Math.round(n) })
  }
  return out
}

function DayDetail({
  day,
  projectId,
  showBusiness,
  downloads,
  subscriptions,
  revenue,
  avgDownloads,
  onClose,
  onPrev,
  onNext,
}: {
  day: string
  projectId: number | null
  showBusiness: boolean
  downloads: number | undefined
  subscriptions: number | undefined
  revenue: number | undefined
  avgDownloads: number | null
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
}) {
  const [loaded, setLoaded] = useState<{ key: string; videos: SheetDayVideo[] } | null>(null)
  const key = `${day}|${projectId ?? ''}`

  useEffect(() => {
    let cancelled = false
    loadSheetDay(day, projectId).then((videos) => {
      if (!cancelled) setLoaded({ key, videos })
    })
    return () => {
      cancelled = true
    }
  }, [day, projectId, key])

  const videos = loaded?.key === key ? loaded.videos : null

  const summary = useMemo(() => {
    if (!videos) return null
    const byPerson = new Map<
      number,
      { id: number; name: string; role: 'creator' | 'reposter'; views: number; tt: number; ig: number }
    >()
    let views = 0
    let tt = 0
    let ig = 0
    for (const v of videos) {
      views += v.views
      if (v.platform === 'tiktok') tt++
      else ig++
      const p = byPerson.get(v.creator_id) ?? {
        id: v.creator_id,
        name: v.creator_name,
        role: v.role,
        views: 0,
        tt: 0,
        ig: 0,
      }
      p.views += v.views
      if (v.platform === 'tiktok') p.tt++
      else p.ig++
      byPerson.set(v.creator_id, p)
    }
    const people = [...byPerson.values()].sort((a, b) => b.views - a.views)
    return {
      views,
      tt,
      ig,
      people,
      creators: people.filter((p) => p.role === 'creator').length,
      reposters: people.filter((p) => p.role === 'reposter').length,
    }
  }, [videos])

  const top = summary?.people[0]
  const topShare = top && summary && summary.views > 0 ? top.views / summary.views : 0
  const dlDelta =
    downloads != null && avgDownloads != null && avgDownloads > 0
      ? (downloads - avgDownloads) / avgDownloads
      : null

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!onPrev}
              onClick={() => onPrev?.()}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-40"
              aria-label="Previous day"
            >
              <ChevronLeft className="size-4" />
            </button>
            <h3 className="text-base font-semibold">{dayLabel(day)}</h3>
            <button
              type="button"
              disabled={!onNext}
              onClick={() => onNext?.()}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-40"
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent"
            aria-label="Close day"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {!summary ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Views</p>
                  <p className="text-lg font-semibold tabular-nums">{formatNumber(summary.views)}</p>
                </div>
                {showBusiness ? (
                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Downloads</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {downloads != null ? formatNumber(downloads) : '—'}
                    </p>
                    {dlDelta != null ? (
                      <p className={`text-xs ${dlDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {dlDelta >= 0 ? '+' : ''}
                        {Math.round(dlDelta * 100)}% vs avg
                      </p>
                    ) : null}
                    {subscriptions != null || revenue != null ? (
                      <p className="text-xs text-muted-foreground">
                        <span style={{ color: SUBS }}>{subscriptions ?? 0} subs</span>
                        {revenue != null ? (
                          <>
                            {' · '}
                            <span style={{ color: REVENUE }}>{money(revenue)}</span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Videos</p>
                  <p className="text-lg font-semibold tabular-nums">{summary.tt + summary.ig}</p>
                  <p className="text-xs text-muted-foreground">
                    <span style={{ color: TT }}>TT {summary.tt}</span> ·{' '}
                    <span style={{ color: IG }}>IG {summary.ig}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Who posted</p>
                  <p className="text-lg font-semibold tabular-nums">{summary.people.length}</p>
                  <p className="text-xs text-muted-foreground">
                    <span style={{ color: CREATOR }}>{summary.creators} creators</span> ·{' '}
                    <span style={{ color: REPOSTER }}>{summary.reposters} reposters</span>
                  </p>
                </div>
              </div>

              {top && summary.views > 0 ? (
                <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-semibold">{top.name}</span> drove{' '}
                  <span className="font-semibold">{Math.round(topShare * 100)}%</span> of this day&apos;s views
                  ({formatNumber(top.views)}) with {top.tt + top.ig} video{top.tt + top.ig === 1 ? '' : 's'}.
                </p>
              ) : null}

              <div>
                <h4 className="mb-1.5 text-sm font-semibold">Who drove this day</h4>
                {summary.people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody posted this day.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {summary.people.map((p, i) => {
                      const share = summary.views > 0 ? p.views / summary.views : 0
                      return (
                        <li key={p.id} className="px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">
                              <span className="text-muted-foreground">{i + 1}.</span>{' '}
                              <span className="font-medium">{p.name}</span>{' '}
                              <span
                                className="text-[10px] font-semibold uppercase"
                                style={{ color: p.role === 'reposter' ? REPOSTER : CREATOR }}
                              >
                                {p.role === 'reposter' ? 'Reposter' : 'Creator'}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                              <span className="font-semibold">{formatNumber(p.views)}</span>{' '}
                              <span className="text-xs text-muted-foreground">
                                ({(share * 100).toFixed(1)}%) · TT {p.tt} · IG {p.ig}
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(share * 100, 1)}%`,
                                backgroundColor: p.role === 'reposter' ? REPOSTER : CREATOR,
                              }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {videos && videos.length > 0 ? (
                <div>
                  <h4 className="mb-1.5 text-sm font-semibold">Top videos</h4>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {videos.slice(0, 20).map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 truncate underline-offset-2 hover:underline"
                        >
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: v.platform === 'tiktok' ? TT : IG }}
                          >
                            {v.platform === 'tiktok' ? 'TT' : 'IG'}
                          </span>
                          <span className="truncate">{v.creator_name}</span>
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                        </a>
                        <span className="shrink-0 font-semibold tabular-nums">{formatNumber(v.views)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PersonTimeline({
  person,
  from,
  to,
  dates,
  projectId,
  showBusiness,
  downloadsByDate,
  subsByDate,
  onClose,
}: {
  person: PersonAgg
  from: string
  to: string
  dates: string[]
  projectId: number | null
  showBusiness: boolean
  downloadsByDate: Map<string, number>
  subsByDate: Map<string, number>
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState<{
    key: string
    videos: Array<SheetDayVideo & { date: string }>
  } | null>(null)
  const key = `${person.id}|${from}|${to}|${projectId ?? ''}`

  useEffect(() => {
    let cancelled = false
    loadSheetPerson(person.id, from, to, projectId).then((videos) => {
      if (!cancelled) setLoaded({ key, videos })
    })
    return () => {
      cancelled = true
    }
  }, [person.id, from, to, projectId, key])

  const videos = loaded?.key === key ? loaded.videos : null
  const data = dates.map((d) => ({
    date: d.slice(5),
    fullDate: d,
    views: person.byDate.get(d)?.views ?? 0,
    videos: person.byDate.get(d)?.videos ?? 0,
    downloads: downloadsByDate.get(d) ?? null,
    subs: subsByDate.get(d) ?? null,
  }))
  const withDl = dates.filter((d) => downloadsByDate.has(d))
  const posted = withDl.filter((d) => (person.byDate.get(d)?.videos ?? 0) > 0)
  const quiet = withDl.filter((d) => (person.byDate.get(d)?.videos ?? 0) === 0)
  const avgOn = average(posted.map((d) => downloadsByDate.get(d) ?? 0))
  const avgOff = average(quiet.map((d) => downloadsByDate.get(d) ?? 0))
  const daysPosted = [...person.byDate.values()].filter((c) => c.videos > 0).length

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">
              {person.name}{' '}
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ color: person.role === 'reposter' ? REPOSTER : CREATOR }}
              >
                {person.role === 'reposter' ? 'Reposter' : 'Creator'}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {dayLabel(from)} → {dayLabel(to)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Views', value: formatNumber(person.views) },
              { label: 'Videos', value: formatNumber(person.videos) },
              { label: 'Days posted', value: `${daysPosted} / ${dates.length}` },
              ...(showBusiness
                ? [
                    {
                      label: 'Avg downloads: posted vs not',
                      value: `${avgOn == null ? '—' : formatNumber(Math.round(avgOn))} vs ${
                        avgOff == null ? '—' : formatNumber(Math.round(avgOff))
                      }`,
                    },
                  ]
                : []),
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 h-64 w-full rounded-lg border border-border p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="views"
                  tick={{ fontSize: 11 }}
                  width={56}
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
                {showBusiness ? (
                  <YAxis
                    yAxisId="biz"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    width={44}
                    tickFormatter={(v) => formatNumber(Number(v))}
                  />
                ) : null}
                <Tooltip
                  formatter={(value, name) =>
                    value == null ? ['—', String(name)] : [formatNumber(Number(value)), String(name)]
                  }
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { fullDate?: string; videos?: number } | undefined
                    return p?.fullDate ? `${dayLabel(p.fullDate)} · ${p.videos ?? 0} video(s)` : ''
                  }}
                />
                <Legend />
                <Bar
                  yAxisId="views"
                  dataKey="views"
                  name={`${person.name} views`}
                  fill={person.role === 'reposter' ? REPOSTER : CREATOR}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
                {showBusiness ? (
                  <Line
                    yAxisId="biz"
                    type="monotone"
                    dataKey="downloads"
                    name="Downloads"
                    stroke={DOWNLOADS}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null}
                {showBusiness ? (
                  <Line
                    yAxisId="biz"
                    type="monotone"
                    dataKey="subs"
                    name="Subscriptions"
                    stroke={SUBS}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <h4 className="mt-4 mb-1.5 text-sm font-semibold">Top posts</h4>
          {!videos ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </p>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos in this range.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {videos.slice(0, 25).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1.5 truncate underline-offset-2 hover:underline"
                  >
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: v.platform === 'tiktok' ? TT : IG }}
                    >
                      {v.platform === 'tiktok' ? 'TT' : 'IG'}
                    </span>
                    <span className="truncate">{dayLabel(v.date)}</span>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </a>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{formatNumber(v.views)}</span>
                    {showBusiness && downloadsByDate.has(v.date) ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        · {formatNumber(downloadsByDate.get(v.date) ?? 0)} downloads that day
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export function AnalyticsSheet({
  rows,
  downloads,
  from: serverFrom,
  to: serverTo,
  today,
  projectId,
  projects,
  showBusiness,
  revenueCatProjectIds,
}: {
  rows: SheetRow[]
  downloads: DailyDownloadsRow[]
  from: string
  to: string
  today: string
  projectId: number | null
  projects: Array<{ id: number; name: string }>
  /** Owner only: downloads, subscriptions, revenue and the impact tab. */
  showBusiness: boolean
  /** Projects with a RevenueCat link configured (env). */
  revenueCatProjectIds: number[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savePending, startSave] = useTransition()
  const [tab, setTab] = useState<Tab>('day')
  const [roleView, setRoleView] = useState<RoleView>('all')
  const [from, setFrom] = useState(serverFrom)
  const [to, setTo] = useState(serverTo)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [openPersonId, setOpenPersonId] = useState<number | null>(null)
  const [chartMode, setChartMode] = useState<ChartMode>('views')
  const [impactSort, setImpactSort] = useState<{ key: ImpactSort; desc: boolean }>({
    key: 'estDl',
    desc: true,
  })
  const rcConnected =
    projectId != null ? revenueCatProjectIds.includes(projectId) : revenueCatProjectIds.length > 0

  const serverKey = `${serverFrom}|${serverTo}|${projectId ?? ''}`
  const [syncedKey, setSyncedKey] = useState(serverKey)
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey)
    setFrom(serverFrom)
    setTo(serverTo)
    setDrafts({})
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function push(patch: { from?: string; to?: string; project?: number | 'all'; close?: boolean }) {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    if (patch.close) params.delete('aSheet')
    else params.set('aSheet', '1')
    params.set('aFrom', patch.from ?? from)
    params.set('aTo', patch.to ?? to)
    params.set('aProject', String(patch.project ?? projectId ?? 'all'))
    params.delete('aCreator')
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (openDay) setOpenDay(null)
      else if (openPersonId != null) setOpenPersonId(null)
      else push({ close: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function selectDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return
    push({ from: day, to: day })
  }

  function selectMonth(ym: string) {
    if (!/^\d{4}-\d{2}$/.test(ym)) return
    const { start, end } = rankingMonthRange(ym, today)
    push({ from: start, to: end })
  }

  const dates = useMemo(() => eachDate(serverFrom, serverTo), [serverFrom, serverTo])
  const singleDay = serverFrom === serverTo ? serverFrom : ''
  const stepAnchor = singleDay || (serverTo > today ? today : serverTo)
  const currentMonth = today.slice(0, 7)
  const lastMonth = shiftYearMonth(currentMonth, -1)

  const { downloadsByDate, downloadSource, subsByDate, revenueByDate } = useMemo(() => {
    const m = new Map<string, number>()
    const src = new Map<string, string>()
    const subs = new Map<string, number>()
    const rev = new Map<string, number>()
    for (const d of downloads) {
      m.set(d.date, d.downloads)
      src.set(d.date, d.source)
      if (d.subscriptions != null) subs.set(d.date, d.subscriptions)
      if (d.revenue != null) rev.set(d.date, d.revenue)
    }
    return { downloadsByDate: m, downloadSource: src, subsByDate: subs, revenueByDate: rev }
  }, [downloads])

  const { byDay, totals, people } = useMemo(() => {
    const byDay = new Map<string, DayAgg>()
    for (const d of dates) byDay.set(d, emptyDay())
    const totals = emptyDay()
    const peopleMap = new Map<number, PersonAgg>()
    for (const r of rows) {
      const day = byDay.get(r.date) ?? emptyDay()
      byDay.set(r.date, day)
      const isTt = r.platform === 'tiktok'
      const isRep = r.role === 'reposter'
      for (const agg of [day, totals]) {
        agg.videos += r.videos
        agg.views += r.views
        if (isTt) {
          agg.ttVideos += r.videos
          agg.ttViews += r.views
        } else {
          agg.igVideos += r.videos
          agg.igViews += r.views
        }
        if (isRep) {
          agg.reposterVideos += r.videos
          agg.reposterViews += r.views
        } else {
          agg.creatorVideos += r.videos
          agg.creatorViews += r.views
        }
      }
      let p = peopleMap.get(r.creator_id)
      if (!p) {
        p = {
          id: r.creator_id,
          name: r.creator_name,
          role: r.role,
          ttVideos: 0,
          igVideos: 0,
          ttViews: 0,
          igViews: 0,
          views: 0,
          videos: 0,
          byDate: new Map(),
        }
        peopleMap.set(r.creator_id, p)
      }
      p.views += r.views
      p.videos += r.videos
      if (isTt) {
        p.ttVideos += r.videos
        p.ttViews += r.views
      } else {
        p.igVideos += r.videos
        p.igViews += r.views
      }
      const cell = p.byDate.get(r.date) ?? { views: 0, videos: 0 }
      cell.views += r.views
      cell.videos += r.videos
      p.byDate.set(r.date, cell)
    }
    const people = [...peopleMap.values()].sort(
      (a, b) => b.views - a.views || a.name.localeCompare(b.name),
    )
    return { byDay, totals, people }
  }, [rows, dates])

  const totalDownloads = dates.reduce((sum, d) => sum + (downloadsByDate.get(d) ?? 0), 0)
  const totalSubs = dates.reduce((sum, d) => sum + (subsByDate.get(d) ?? 0), 0)
  const totalRevenue = dates.reduce((sum, d) => sum + (revenueByDate.get(d) ?? 0), 0)
  const hasSubs = subsByDate.size > 0
  const hasRevenue = revenueByDate.size > 0
  const daysWithDownloads = useMemo(
    () => dates.filter((d) => downloadsByDate.has(d)),
    [dates, downloadsByDate],
  )

  const visiblePeople = people.filter((p) => roleView === 'all' || p.role === roleView)
  const visibleTotals = useMemo(() => {
    const t = { ttVideos: 0, igVideos: 0, ttViews: 0, igViews: 0, views: 0, videos: 0 }
    const perDate = new Map<string, number>()
    for (const p of visiblePeople) {
      t.ttVideos += p.ttVideos
      t.igVideos += p.igVideos
      t.ttViews += p.ttViews
      t.igViews += p.igViews
      t.views += p.views
      t.videos += p.videos
      for (const [d, c] of p.byDate) perDate.set(d, (perDate.get(d) ?? 0) + c.views)
    }
    return { ...t, perDate }
  }, [visiblePeople])

  const chartData = dates.map((d) => {
    const a = byDay.get(d) ?? emptyDay()
    return {
      date: d.slice(5),
      fullDate: d,
      views: a.views,
      creatorViews: a.creatorViews,
      reposterViews: a.reposterViews,
      downloads: downloadsByDate.get(d) ?? null,
      subs: subsByDate.get(d) ?? null,
      revenue: revenueByDate.get(d) ?? null,
      viewsPerDownload: (() => {
        const dl = downloadsByDate.get(d)
        return dl ? Math.round(a.views / dl) : null
      })(),
      subsPer100: (() => {
        const dl = downloadsByDate.get(d)
        const s = subsByDate.get(d)
        return dl && s != null ? Number(((s / dl) * 100).toFixed(1)) : null
      })(),
      revenuePerDownload: (() => {
        const dl = downloadsByDate.get(d)
        const r = revenueByDate.get(d)
        return dl && r != null ? Number((r / dl).toFixed(2)) : null
      })(),
    }
  })

  const impact = useMemo(() => {
    const ds = daysWithDownloads
    const dl = ds.map((d) => downloadsByDate.get(d) ?? 0)
    const sb = ds.map((d) => subsByDate.get(d) ?? 0)
    const series = (pick: (d: string) => number) => ({
      r: pearson(ds.map(pick), dl),
      rSubs: pearson(ds.map(pick), sb),
    })
    const groups = [
      { label: 'All views', ...series((d) => byDay.get(d)?.views ?? 0) },
      { label: 'Creator views', ...series((d) => byDay.get(d)?.creatorViews ?? 0) },
      { label: 'Reposter views', ...series((d) => byDay.get(d)?.reposterViews ?? 0) },
      { label: 'TikTok views', ...series((d) => byDay.get(d)?.ttViews ?? 0) },
      { label: 'Instagram views', ...series((d) => byDay.get(d)?.igViews ?? 0) },
      { label: 'Videos posted', ...series((d) => byDay.get(d)?.videos ?? 0) },
    ]

    // A "quiet day" baseline: downloads you'd get anyway, without a video push.
    const baseDl = percentile(dl, 0.2)
    const baseSubs = percentile(sb, 0.2)
    const spikeCut = percentile(dl, 0.8)
    const spikeDays = ds.filter((d) => (downloadsByDate.get(d) ?? 0) >= spikeCut && spikeCut > baseDl)

    const perPerson = people.map((p) => {
      const postedOn = (d: string) => (p.byDate.get(d)?.videos ?? 0) > 0
      const posted = ds.filter(postedOn)
      const notPosted = ds.filter((d) => !postedOn(d))
      const dlOf = (d: string) => downloadsByDate.get(d) ?? 0
      const subOf = (d: string) => subsByDate.get(d) ?? 0
      const avgPosted = average(posted.map(dlOf))
      const avgNotPosted = average(notPosted.map(dlOf))
      const subsPosted = average(posted.map(subOf))
      const subsNotPosted = average(notPosted.map(subOf))

      let estDl = 0
      let estSubs = 0
      for (const d of ds) {
        const dayViews = byDay.get(d)?.views ?? 0
        const mine = p.byDate.get(d)?.views ?? 0
        if (dayViews <= 0 || mine <= 0) continue
        const share = mine / dayViews
        estDl += share * Math.max(0, dlOf(d) - baseDl)
        estSubs += share * Math.max(0, subOf(d) - baseSubs)
      }

      const nextAfterPost = ds.filter((d) => postedOn(addDays(d, -1)))
      const nextAfterQuiet = ds.filter((d) => !postedOn(addDays(d, -1)))
      const nextOn = average(nextAfterPost.map(dlOf))
      const nextOff = average(nextAfterQuiet.map(dlOf))

      const dlLift = avgPosted != null && avgNotPosted != null ? avgPosted - avgNotPosted : null
      const subLift = subsPosted != null && subsNotPosted != null ? subsPosted - subsNotPosted : null
      return {
        ...p,
        r: pearson(ds.map((d) => p.byDate.get(d)?.views ?? 0), dl),
        share: totals.views > 0 ? p.views / totals.views : 0,
        daysPosted: [...p.byDate.values()].filter((c) => c.videos > 0).length,
        avgPosted,
        avgNotPosted,
        dlLift,
        subLift,
        estDl,
        estSubs,
        per1k: p.views > 0 ? (estDl / p.views) * 1000 : null,
        nextDay: nextOn != null && nextOff != null ? nextOn - nextOff : null,
        spikes: spikeDays.filter(postedOn).length,
      }
    })
    return { groups, perPerson, baseDl, baseSubs, spikeDays: spikeDays.length }
  }, [daysWithDownloads, downloadsByDate, subsByDate, byDay, people, totals.views])

  const sortedImpact = useMemo(() => {
    const { key, desc } = impactSort
    const val = (p: (typeof impact.perPerson)[number]): number => {
      const v = p[key]
      return v == null ? Number.NEGATIVE_INFINITY : v
    }
    return [...impact.perPerson].sort((a, b) => {
      const diff = desc ? val(b) - val(a) : val(a) - val(b)
      return diff || b.views - a.views
    })
  }, [impact, impactSort])

  const openPerson = openPersonId != null ? people.find((p) => p.id === openPersonId) ?? null : null

  const dirtyDates = Object.keys(drafts).filter((d) => {
    const raw = drafts[d].trim()
    const current = downloadsByDate.get(d)
    if (raw === '') return current != null
    return Number(raw) !== current
  })

  function importFile(file: File) {
    file.text().then((text) => {
      const entries = parsePastedDownloads(text)
      if (entries.length === 0) {
        setSaveMsg('No "date, number" rows found in that file.')
        return
      }
      saveDrafts(entries, 'import')
    })
  }

  function syncRevenueCat() {
    setSaveMsg(null)
    startSave(async () => {
      const res = await syncRevenueCatNow(serverFrom, serverTo, projectId)
      setSaveMsg(res.ok ? `RevenueCat: updated ${res.days} day${res.days === 1 ? '' : 's'}.` : res.error)
      if (res.ok) router.refresh()
    })
  }

  function saveDrafts(
    entries: Array<{ date: string; downloads: number | null }>,
    source: 'manual' | 'import' = 'manual',
  ) {
    if (projectId == null || entries.length === 0) return
    setSaveMsg(null)
    startSave(async () => {
      const res = await saveDailyDownloads(projectId, entries, source)
      if (res.ok) {
        setDrafts({})
        setPasteText('')
        setPasteOpen(false)
        setSaveMsg(`Saved ${res.saved} day${res.saved === 1 ? '' : 's'}.`)
        router.refresh()
      } else {
        setSaveMsg(res.error)
      }
    })
  }

  const projectName = projects.find((p) => p.id === projectId)?.name ?? 'All projects'
  const projectLabel = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  function exportDaily() {
    const headers = [
      'date',
      ...(showBusiness ? ['downloads', 'subscriptions', 'revenue_usd'] : []),
      'total_views',
      'tiktok_views',
      'instagram_views',
      'creator_views',
      'reposter_views',
      'total_videos',
      'tiktok_videos',
      'instagram_videos',
      'creator_videos',
      'reposter_videos',
      ...people.map((p) => `${p.name} (${p.role}) views`),
      ...people.map((p) => `${p.name} (${p.role}) videos`),
    ]
    const lines = dates.map((d) => {
      const a = byDay.get(d) ?? emptyDay()
      return [
        d,
        ...(showBusiness
          ? [downloadsByDate.get(d) ?? '', subsByDate.get(d) ?? '', revenueByDate.get(d) ?? '']
          : []),
        a.views,
        a.ttViews,
        a.igViews,
        a.creatorViews,
        a.reposterViews,
        a.videos,
        a.ttVideos,
        a.igVideos,
        a.creatorVideos,
        a.reposterVideos,
        ...people.map((p) => p.byDate.get(d)?.views ?? 0),
        ...people.map((p) => p.byDate.get(d)?.videos ?? 0),
      ]
    })
    downloadFile(`daily-sheet-${projectLabel}-${serverFrom}-${serverTo}.csv`, headers, lines)
  }

  function exportLong() {
    const headers = [
      'date',
      'person',
      'role',
      'platform',
      'videos',
      'views',
      ...(showBusiness ? ['downloads_that_day'] : []),
    ]
    const lines = rows.map((r) => [
      r.date,
      r.creator_name,
      r.role,
      r.platform,
      r.videos,
      r.views,
      ...(showBusiness ? [downloadsByDate.get(r.date) ?? ''] : []),
    ])
    downloadFile(`posts-by-person-${projectLabel}-${serverFrom}-${serverTo}.csv`, headers, lines)
  }

  const chip = (active: boolean) =>
    `h-8 rounded-lg border px-3 text-sm font-medium transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
    }`
  const th =
    'sticky top-0 z-10 border border-border bg-muted px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap'
  const td = 'border border-border px-2 py-1 text-right tabular-nums whitespace-nowrap'
  const totalTd = `${td} bg-primary/10 font-semibold`
  const n = (v: number) => (v === 0 ? <span className="text-muted-foreground/60">0</span> : formatNumber(v))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Daily sheet · {projectName}</h2>
            <p className="text-xs text-muted-foreground">
              {serverFrom === serverTo ? dayLabel(serverFrom) : `${dayLabel(serverFrom)} → ${dayLabel(serverTo)}`}{' '}
              · views are counted on the day each video was posted
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportDaily}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
              title="One row per day: views, videos, and each person's views"
            >
              <Download className="size-3.5" />
              Daily CSV
            </button>
            <button
              type="button"
              onClick={exportLong}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
              title="One row per day × person × platform"
            >
              <Download className="size-3.5" />
              Per-person CSV
            </button>
            <button
              type="button"
              onClick={() => push({ close: true })}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent"
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => push({ project: 'all' })} className={chip(projectId == null)}>
            All projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => push({ project: p.id })}
              className={chip(projectId === p.id)}
            >
              {p.name}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <button type="button" onClick={() => selectMonth(currentMonth)} className={chip(false)}>
            {monthName(currentMonth)}
          </button>
          <button type="button" onClick={() => selectMonth(lastMonth)} className={chip(false)}>
            {monthName(lastMonth)}
          </button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <button
            type="button"
            disabled={isPending}
            onClick={() => selectDay(singleDay ? addDays(singleDay, -1) : stepAnchor)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            value={singleDay}
            max={today}
            onChange={(e) => selectDay(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Day"
          />
          <button
            type="button"
            disabled={isPending || (singleDay !== '' && singleDay >= today)}
            onClick={() => selectDay(singleDay ? addDays(singleDay, 1) : stepAnchor)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (from && to && from <= to) push({ from, to })
            }}
          >
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="From"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="To"
            />
            <button type="submit" className="h-8 rounded-lg border border-border px-3 text-sm hover:bg-accent">
              Show
            </button>
          </form>
        </div>
      </header>

      <div className="relative flex-1 overflow-auto px-4 py-3">
        {isPending ? (
          <div className="absolute inset-0 z-30 flex items-start justify-center bg-background/60 pt-24 backdrop-blur-[1px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Loading…
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: 'Total views', value: totals.views },
            { label: 'TikTok views', value: totals.ttViews, color: TT },
            { label: 'Instagram views', value: totals.igViews, color: IG },
            { label: 'TikTok videos', value: totals.ttVideos, color: TT },
            { label: 'Instagram posts', value: totals.igVideos, color: IG },
            { label: 'By creators', value: totals.creatorVideos, color: CREATOR },
            { label: 'By reposters', value: totals.reposterVideos, color: REPOSTER },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums" style={s.color ? { color: s.color } : undefined}>
                {formatNumber(s.value)}
              </p>
            </div>
          ))}
        </div>

        {showBusiness ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Downloads', value: formatNumber(totalDownloads), color: undefined },
              {
                label: 'Subscriptions',
                value: hasSubs ? formatNumber(totalSubs) : '—',
                color: SUBS,
              },
              {
                label: 'Revenue',
                value: hasRevenue ? money(totalRevenue) : '—',
                color: REVENUE,
              },
              {
                label: 'Views per download',
                value: fmtRatio(ratio(totals.views, totalDownloads), 0),
                color: undefined,
              },
              {
                label: 'Subs per 100 downloads',
                value: hasSubs ? fmtRatio(ratio(totalSubs, totalDownloads, 100)) : '—',
                color: SUBS,
              },
              {
                label: 'Revenue per download',
                value: hasRevenue && totalDownloads > 0 ? money(totalRevenue / totalDownloads) : '—',
                color: REVENUE,
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold tabular-nums" style={s.color ? { color: s.color } : undefined}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {showBusiness ? (
          <div className="mt-3 inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {(
              [
                ['views', 'Views vs downloads'],
                ['ratios', 'Ratios over time'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartMode(id)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  chartMode === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-2 h-72 w-full rounded-lg border border-border p-2">
          <ResponsiveContainer width="100%" height="100%">
            {showBusiness && chartMode === 'ratios' ? (
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="vpd"
                  tick={{ fontSize: 11 }}
                  width={56}
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
                <YAxis yAxisId="small" orientation="right" tick={{ fontSize: 11 }} width={44} />
                <Tooltip
                  formatter={(value, name) => {
                    if (value == null) return ['—', String(name)]
                    const v = Number(value)
                    return [String(name).startsWith('Revenue') ? money(v) : formatNumber(v), String(name)]
                  }}
                  labelFormatter={(_, payload) => {
                    const d = payload?.[0]?.payload?.fullDate as string | undefined
                    return d ? dayLabel(d) : ''
                  }}
                />
                <Legend />
                <Line
                  yAxisId="vpd"
                  type="monotone"
                  dataKey="viewsPerDownload"
                  name="Views per download"
                  stroke="#0F172A"
                  strokeWidth={2}
                  dot={dates.length <= 31}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="small"
                  type="monotone"
                  dataKey="subsPer100"
                  name="Subs per 100 downloads"
                  stroke={SUBS}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="small"
                  type="monotone"
                  dataKey="revenuePerDownload"
                  name="Revenue per download"
                  stroke={REVENUE}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            ) : (
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              onClick={(state) => {
                const i = Number(state?.activeIndex)
                const d = Number.isInteger(i) ? chartData[i]?.fullDate : undefined
                if (d) setOpenDay(d)
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="views"
                tick={{ fontSize: 11 }}
                width={60}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              {showBusiness ? (
                <YAxis
                  yAxisId="downloads"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  width={48}
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
              ) : null}
              <Tooltip
                formatter={(value, name) =>
                  value == null ? ['—', String(name)] : [formatNumber(Number(value)), String(name)]
                }
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.fullDate as string | undefined
                  return d ? dayLabel(d) : ''
                }}
              />
              <Legend />
              {showBusiness ? (
                <Bar
                  yAxisId="downloads"
                  dataKey="downloads"
                  name="Downloads"
                  fill={DOWNLOADS}
                  opacity={0.55}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              ) : null}
              {showBusiness && hasSubs ? (
                <Line
                  yAxisId="downloads"
                  type="monotone"
                  dataKey="subs"
                  name="Subscriptions"
                  stroke={SUBS}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="views"
                name="Total views"
                stroke="#0F172A"
                strokeWidth={2.5}
                dot={dates.length <= 31}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="creatorViews"
                name="Creator views"
                stroke={CREATOR}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="reposterViews"
                name="Reposter views"
                stroke={REPOSTER}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {(
              [
                ['day', 'By day'],
                ['person', 'By person'],
                ...(showBusiness ? ([['impact', 'Who drives downloads']] as const) : []),
              ] as ReadonlyArray<readonly [Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  tab === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'day' && showBusiness ? (
            <>
              {rcConnected ? (
                <button
                  type="button"
                  disabled={savePending}
                  onClick={syncRevenueCat}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent disabled:opacity-60"
                  title="Pull downloads, subscriptions and revenue from RevenueCat for these dates (hand-typed downloads are kept)"
                >
                  <RefreshCw className={`size-3.5 ${savePending ? 'animate-spin' : ''}`} />
                  Sync RevenueCat
                </button>
              ) : null}
              {projectId != null ? (
                <>
                  <label
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
                    title="Upload the RevenueCat “New customers” CSV (or any date, number file)"
                  >
                    <FileUp className="size-3.5" />
                    Import CSV
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) importFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setPasteOpen((v) => !v)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
                  >
                    <ClipboardPaste className="size-3.5" />
                    Paste downloads
                  </button>
                  {dirtyDates.length > 0 ? (
                    <button
                      type="button"
                      disabled={savePending}
                      onClick={() =>
                        saveDrafts(
                          dirtyDates.map((d) => ({
                            date: d,
                            downloads: drafts[d].trim() === '' ? null : Number(drafts[d]),
                          })),
                        )
                      }
                      className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {savePending ? 'Saving…' : `Save downloads (${dirtyDates.length})`}
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Pick Notek or Miqat above to type in downloads for that app.
                </span>
              )}
              {saveMsg ? <span className="text-xs text-muted-foreground">{saveMsg}</span> : null}
            </>
          ) : null}
          {tab === 'person' ? (
            <div className="inline-flex gap-1">
              {(
                [
                  ['all', 'Everyone'],
                  ['creator', 'Creators'],
                  ['reposter', 'Reposters'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setRoleView(id)} className={chip(roleView === id)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {tab === 'day' && showBusiness && pasteOpen && projectId != null ? (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Paste two columns from App Store / Play Console / Excel: date and downloads. One day per line,
              e.g. <code>2026-09-01, 120</code> or <code>09/01/2026 120</code>.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savePending || parsePastedDownloads(pasteText).length === 0}
                onClick={() => saveDrafts(parsePastedDownloads(pasteText))}
                className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Save {parsePastedDownloads(pasteText).length} days
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'day' ? (
          <div className="mt-2 overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} left-0 z-20 text-left`}>Date</th>
                  <th className={th} style={{ color: TT }}>TikTok videos</th>
                  <th className={th} style={{ color: IG }}>Instagram posts</th>
                  <th className={th} style={{ color: CREATOR }}>By creators</th>
                  <th className={th} style={{ color: REPOSTER }}>By reposters</th>
                  <th className={th} style={{ color: TT }}>TikTok views</th>
                  <th className={th} style={{ color: IG }}>Instagram views</th>
                  <th className={th} style={{ color: CREATOR }}>Creator views</th>
                  <th className={th} style={{ color: REPOSTER }}>Reposter views</th>
                  <th className={th}>Total views</th>
                  {showBusiness ? (
                    <>
                      <th className={th}>Downloads</th>
                      <th className={th} style={{ color: SUBS }}>Subscriptions</th>
                      <th className={th} style={{ color: REVENUE }}>Revenue</th>
                      <th className={th}>Views / download</th>
                      <th className={th} style={{ color: SUBS }}>Subs / 100 downloads</th>
                      <th className={th} style={{ color: REVENUE }}>$ / download</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${totalTd} sticky left-0 text-left`}>Total</td>
                  <td className={totalTd}>{formatNumber(totals.ttVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.igVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.creatorVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.reposterVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.ttViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.igViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.creatorViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.reposterViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.views)}</td>
                  {showBusiness ? (
                    <>
                      <td className={totalTd}>{formatNumber(totalDownloads)}</td>
                      <td className={totalTd}>{hasSubs ? formatNumber(totalSubs) : '—'}</td>
                      <td className={totalTd}>{hasRevenue ? money(totalRevenue) : '—'}</td>
                      <td className={totalTd}>{fmtRatio(ratio(totals.views, totalDownloads), 0)}</td>
                      <td className={totalTd}>
                        {hasSubs ? fmtRatio(ratio(totalSubs, totalDownloads, 100)) : '—'}
                      </td>
                      <td className={totalTd}>
                        {hasRevenue && totalDownloads > 0 ? money(totalRevenue / totalDownloads) : '—'}
                      </td>
                    </>
                  ) : null}
                </tr>
                {dates.map((d, i) => {
                  const a = byDay.get(d) ?? emptyDay()
                  const dl = downloadsByDate.get(d)
                  const draft = drafts[d]
                  return (
                    <tr key={d} className={i % 2 ? 'bg-muted/20' : ''}>
                      <td className={`${td} sticky left-0 bg-background p-0 text-left font-medium`}>
                        <button
                          type="button"
                          onClick={() => setOpenDay(d)}
                          className="w-full px-2 py-1 text-left text-primary underline-offset-2 hover:underline"
                          title="See who posted and who drove this day"
                        >
                          {dayLabel(d)}
                        </button>
                      </td>
                      <td className={td}>{n(a.ttVideos)}</td>
                      <td className={td}>{n(a.igVideos)}</td>
                      <td className={td}>{n(a.creatorVideos)}</td>
                      <td className={td}>{n(a.reposterVideos)}</td>
                      <td className={td}>{n(a.ttViews)}</td>
                      <td className={td}>{n(a.igViews)}</td>
                      <td className={td}>{n(a.creatorViews)}</td>
                      <td className={td}>{n(a.reposterViews)}</td>
                      <td className={`${td} font-semibold`}>{n(a.views)}</td>
                      {showBusiness ? (
                      <>
                      <td className={`${td} p-0`}>
                        {projectId != null ? (
                          <span className="inline-flex items-center">
                          {downloadSource.get(d) === 'revenuecat' && draft == null ? (
                            <span className="pl-1 text-[9px] font-semibold text-muted-foreground" title="Synced from RevenueCat">
                              RC
                            </span>
                          ) : null}
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft ?? (dl != null ? String(dl) : '')}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [d]: e.target.value }))}
                            placeholder="—"
                            className="h-7 w-24 bg-transparent px-2 text-right tabular-nums outline-none focus:bg-accent/40"
                          />
                          </span>
                        ) : (
                          <span className="px-2">{dl != null ? formatNumber(dl) : '—'}</span>
                        )}
                      </td>
                      <td className={td}>
                        {subsByDate.has(d) ? n(subsByDate.get(d) ?? 0) : '—'}
                      </td>
                      <td className={td}>
                        {revenueByDate.has(d) ? money(revenueByDate.get(d) ?? 0) : '—'}
                      </td>
                      <td className={td}>
                        {dl != null && dl > 0 ? formatNumber(Math.round(a.views / dl)) : '—'}
                      </td>
                      <td className={td}>
                        {dl && subsByDate.has(d)
                          ? fmtRatio(ratio(subsByDate.get(d) ?? 0, dl, 100))
                          : '—'}
                      </td>
                      <td className={td}>
                        {dl && revenueByDate.has(d) ? money((revenueByDate.get(d) ?? 0) / dl) : '—'}
                      </td>
                      </>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'person' ? (
          <div className="mt-2 overflow-auto rounded-lg border border-border">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} left-0 z-20 min-w-44 text-left`}>Person</th>
                  <th className={th}>Total views</th>
                  <th className={th} style={{ color: TT }}>TikTok videos</th>
                  <th className={th} style={{ color: IG }}>Instagram posts</th>
                  <th className={th} style={{ color: TT }}>TikTok views</th>
                  <th className={th} style={{ color: IG }}>Instagram views</th>
                  {dates.map((d) => (
                    <th key={d} className={`${th} p-0`}>
                      <button
                        type="button"
                        onClick={() => setOpenDay(d)}
                        className="px-2 py-1.5 text-primary underline-offset-2 hover:underline"
                      >
                        {dayLabel(d)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${totalTd} sticky left-0 text-left`}>
                    Total ({visiblePeople.length})
                  </td>
                  <td className={totalTd}>{formatNumber(visibleTotals.views)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.ttVideos)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.igVideos)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.ttViews)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.igViews)}</td>
                  {dates.map((d) => (
                    <td key={d} className={totalTd}>
                      {formatNumber(visibleTotals.perDate.get(d) ?? 0)}
                    </td>
                  ))}
                </tr>
                {visiblePeople.length === 0 ? (
                  <tr>
                    <td colSpan={6 + dates.length} className={`${td} text-left text-muted-foreground`}>
                      No videos in this range.
                    </td>
                  </tr>
                ) : (
                  visiblePeople.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? 'bg-muted/20' : ''}>
                      <td className={`${td} sticky left-0 bg-background text-left`}>
                        <button
                          type="button"
                          onClick={() => setOpenPersonId(p.id)}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          title="Open this person's timeline"
                        >
                          {p.name}
                        </button>{' '}
                        <span
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: p.role === 'reposter' ? REPOSTER : CREATOR }}
                        >
                          {p.role === 'reposter' ? 'R' : 'C'}
                        </span>
                      </td>
                      <td className={`${td} font-semibold`}>{n(p.views)}</td>
                      <td className={td}>{n(p.ttVideos)}</td>
                      <td className={td}>{n(p.igVideos)}</td>
                      <td className={td}>{n(p.ttViews)}</td>
                      <td className={td}>{n(p.igViews)}</td>
                      {dates.map((d) => {
                        const c = p.byDate.get(d)
                        return (
                          <td key={d} className={td} title={c ? `${c.videos} video(s)` : undefined}>
                            {c ? n(c.views) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'impact' && showBusiness ? (
          <div className="mt-2 flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Which creators bring downloads and subscriptions?</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Est. downloads / subs</span> — each day, downloads
                  above a quiet day ({formatNumber(Math.round(impact.baseDl))} downloads
                  {hasSubs ? `, ${formatNumber(Math.round(impact.baseSubs))} subs` : ''}) are split by each
                  person&apos;s share of that day&apos;s views. Best single number to rank by.
                </li>
                <li>
                  <span className="font-medium text-foreground">Download / subs lift</span> — average on days they
                  posted minus days they didn&apos;t. <span className="font-medium text-foreground">Next day</span>{' '}
                  — the same, one day later (videos keep getting views).
                </li>
                <li>
                  <span className="font-medium text-foreground">Spike days</span> — how many of the top 20% download
                  days ({impact.spikeDays}) they posted on.{' '}
                  <span className="font-medium text-foreground">Per 1k views</span> — est. downloads per 1,000 of
                  their views (efficiency).
                </li>
                <li>
                  Based on{' '}
                  <span className="font-medium text-foreground">
                    {daysWithDownloads.length} day{daysWithDownloads.length === 1 ? '' : 's'}
                  </span>{' '}
                  with downloads
                  {daysWithDownloads.length < 14 ? ' — more days (14+) make this more reliable.' : '.'} It shows
                  a pattern, not proof. Click a column to sort; click a name for their timeline.
                </li>
              </ul>
            </div>

            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {(
                      [
                        ['name', 'Person'],
                        ['views', 'Views'],
                        ['estDl', 'Est. downloads'],
                        ...(hasSubs ? ([['estSubs', 'Est. subs']] as const) : []),
                        ['per1k', 'Downloads per 1k views'],
                        ['dlLift', 'Download lift'],
                        ...(hasSubs ? ([['subLift', 'Subs lift']] as const) : []),
                        ['nextDay', 'Next-day lift'],
                        ['spikes', 'Spike days'],
                        ['r', 'Match (−1 to 1)'],
                      ] as ReadonlyArray<readonly [ImpactSort | 'name', string]>
                    ).map(([key, label]) =>
                      key === 'name' ? (
                        <th key={key} className={`${th} left-0 z-20 text-left`}>
                          {label}
                        </th>
                      ) : (
                        <th key={key} className={`${th} p-0`}>
                          <button
                            type="button"
                            onClick={() =>
                              setImpactSort((prev) =>
                                prev.key === key ? { key, desc: !prev.desc } : { key, desc: true },
                              )
                            }
                            className="inline-flex w-full items-center justify-end gap-1 px-2 py-1.5 hover:bg-accent"
                          >
                            {label}
                            {impactSort.key === key ? (
                              impactSort.desc ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ArrowUp className="size-3" />
                              )
                            ) : null}
                          </button>
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedImpact.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={`${td} text-left text-muted-foreground`}>
                        No videos in this range.
                      </td>
                    </tr>
                  ) : (
                    sortedImpact.map((p, i) => {
                      const s = strengthLabel(p.r)
                      const signed = (v: number | null, digits = 0) =>
                        v == null ? (
                          '—'
                        ) : (
                          <span className={v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : ''}>
                            {v > 0 ? '+' : ''}
                            {digits === 0 ? formatNumber(Math.round(v)) : v.toFixed(digits)}
                          </span>
                        )
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-muted/20' : ''}>
                          <td className={`${td} sticky left-0 bg-background text-left`}>
                            <button
                              type="button"
                              onClick={() => setOpenPersonId(p.id)}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {p.name}
                            </button>{' '}
                            <span
                              className="text-[10px] font-semibold uppercase"
                              style={{ color: p.role === 'reposter' ? REPOSTER : CREATOR }}
                            >
                              {p.role === 'reposter' ? 'R' : 'C'}
                            </span>
                          </td>
                          <td className={td}>
                            {formatNumber(p.views)}{' '}
                            <span className="text-xs text-muted-foreground">
                              {(p.share * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className={`${td} font-semibold`}>{formatNumber(Math.round(p.estDl))}</td>
                          {hasSubs ? (
                            <td className={td} style={{ color: SUBS }}>
                              {p.estSubs.toFixed(1)}
                            </td>
                          ) : null}
                          <td className={td}>{fmtRatio(p.per1k, 2)}</td>
                          <td className={td}>{signed(p.dlLift)}</td>
                          {hasSubs ? <td className={td}>{signed(p.subLift, 1)}</td> : null}
                          <td className={td}>{signed(p.nextDay)}</td>
                          <td className={td}>
                            {p.spikes}
                            <span className="text-xs text-muted-foreground"> / {impact.spikeDays}</span>
                          </td>
                          <td className={`${td} ${s.className}`} title={s.text}>
                            {p.r == null ? '—' : p.r.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>Group</th>
                    <th className={th}>Match with downloads</th>
                    {hasSubs ? <th className={th}>Match with subs</th> : null}
                    <th className={`${th} text-left`}>Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.groups.map((g) => {
                    const s = strengthLabel(g.r)
                    return (
                      <tr key={g.label}>
                        <td className={`${td} text-left font-medium`}>{g.label}</td>
                        <td className={td}>{g.r == null ? '—' : g.r.toFixed(2)}</td>
                        {hasSubs ? (
                          <td className={td}>{g.rSubs == null ? '—' : g.rSubs.toFixed(2)}</td>
                        ) : null}
                        <td className={`${td} text-left ${s.className}`}>{s.text}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {openPerson ? (
        <PersonTimeline
          person={openPerson}
          from={serverFrom}
          to={serverTo}
          dates={dates}
          projectId={projectId}
          showBusiness={showBusiness}
          downloadsByDate={downloadsByDate}
          subsByDate={subsByDate}
          onClose={() => setOpenPersonId(null)}
        />
      ) : null}

      {openDay ? (
        <DayDetail
          day={openDay}
          projectId={projectId}
          showBusiness={showBusiness}
          downloads={downloadsByDate.get(openDay)}
          subscriptions={subsByDate.get(openDay)}
          revenue={revenueByDate.get(openDay)}
          avgDownloads={
            daysWithDownloads.length > 0
              ? daysWithDownloads.reduce((s, d) => s + (downloadsByDate.get(d) ?? 0), 0) /
                daysWithDownloads.length
              : null
          }
          onClose={() => setOpenDay(null)}
          onPrev={
            dates.indexOf(openDay) > 0 ? () => setOpenDay(dates[dates.indexOf(openDay) - 1]) : null
          }
          onNext={
            dates.indexOf(openDay) >= 0 && dates.indexOf(openDay) < dates.length - 1
              ? () => setOpenDay(dates[dates.indexOf(openDay) + 1])
              : null
          }
        />
      ) : null}
    </div>
  )
}
