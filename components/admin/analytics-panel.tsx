'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Sheet, X } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDays, rankingMonthRange } from '@/lib/campaign'
import { shiftYearMonth } from '@/lib/biweekly'
import { formatNumber } from '@/lib/format'
import { colorForPick } from '@/lib/creator-colors'
import type { RoleFilter } from '@/lib/participant-role'
import type {
  CreatorDailyViewsRow,
  CreatorViewsRow,
  DailyAnalyticsRow,
  ViewsSummary,
} from '@/lib/analytics'
import { DateRangePresets } from '@/components/admin/date-range-presets'

const IG = '#E1306C'
const TT = '#0F766E'
const TOTAL = 'currentColor'
const LOG_TICKS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]

type ChartType = 'line' | 'bar'
type YScale = 'log' | 'linear'
type Row = Record<string, string | number | null>

type Labels = {
  views: string
  videos: string
  instagram: string
  tiktok: string
  showVideos: string
  topCreators: string
  empty: string
  from: string
  to: string
  apply: string
  chartLine: string
  chartBar: string
  chartLog: string
  chartLinear: string
  allProjects: string
  roleCreators: string
  roleReposters: string
  roleAll: string
  month: string
  people: string
  loading: string
  day: string
  prevDay: string
  nextDay: string
  openSheet: string
  total: string
  clear: string
  pickHint: string
  splitPlatforms: string
}

type NavPatch = {
  from?: string
  to?: string
  project?: number | 'all'
  role?: RoleFilter
}

function monthName(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
}

/** YYYY-MM when the range is exactly one calendar month (current month ends today). */
function monthOfRange(from: string, to: string, today: string): string {
  if (!/^\d{4}-\d{2}-01$/.test(from)) return ''
  const ym = from.slice(0, 7)
  return rankingMonthRange(ym, today).end === to ? ym : ''
}

function eachDate(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

function seriesKey(creatorId: number) {
  return `c${creatorId}`
}

/** Log scale cannot plot 0; skip those points so small values stay readable. */
function applyYScale(rows: Row[], keys: string[], yScale: YScale): Row[] {
  if (yScale === 'linear') return rows
  return rows.map((row) => {
    const next: Row = { ...row }
    for (const key of keys) {
      const v = row[key]
      if (typeof v === 'number' && v <= 0) next[key] = null
    }
    return next
  })
}

function maxNumeric(rows: Row[], keys: string[]): number {
  let max = 0
  for (const row of rows) {
    for (const key of keys) {
      const v = row[key]
      if (typeof v === 'number' && v > max) max = v
    }
  }
  return max
}

export function AnalyticsPanel({
  daily,
  byCreatorDaily,
  leaderboard,
  summary,
  projects,
  projectId,
  role,
  today,
  defaultFrom,
  defaultTo,
  labels,
}: {
  daily: DailyAnalyticsRow[]
  byCreatorDaily: CreatorDailyViewsRow[]
  leaderboard: CreatorViewsRow[]
  summary: ViewsSummary
  projects: Array<{ id: number; name: string }>
  projectId: number | null
  role: RoleFilter
  today: string
  defaultFrom: string
  defaultTo: string
  labels: Labels
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [picked, setPicked] = useState<number[]>([])
  const [split, setSplit] = useState(false)
  const [showVideos, setShowVideos] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [yScale, setYScale] = useState<YScale>('linear')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const serverKey = `${defaultFrom}|${defaultTo}|${projectId ?? ''}|${role}`
  const [syncedKey, setSyncedKey] = useState(serverKey)
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey)
    setFrom(defaultFrom)
    setTo(defaultTo)
  }

  const currentMonth = today.slice(0, 7)
  const lastMonth = shiftYearMonth(currentMonth, -1)
  const selectedMonth = monthOfRange(from, to, today)
  const singleDay = from === to ? from : ''
  const stepAnchor = singleDay || (to > today ? today : to)

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const r of leaderboard) m.set(r.creator_id, r.creator_name)
    return m
  }, [leaderboard])
  const pickedPeople = useMemo(
    () =>
      picked
        .filter((id) => nameById.has(id))
        .map((id, i) => ({ id, name: nameById.get(id) ?? '', color: colorForPick(i) })),
    [picked, nameById],
  )
  const colorOf = new Map(pickedPeople.map((p) => [p.id, p.color]))
  const byPeople = pickedPeople.length > 0

  const chartData = useMemo(() => {
    const dates = eachDate(defaultFrom, defaultTo)
    const dayMap = new Map(daily.map((d) => [d.date, d]))
    const personViews = new Map<string, number>()
    for (const r of byCreatorDaily) personViews.set(`${r.date}:${r.creator_id}`, r.views)
    return dates.map((date) => {
      const d = dayMap.get(date)
      const row: Row = {
        date: date.slice(5),
        fullDate: date,
        total: (d?.views_instagram ?? 0) + (d?.views_tiktok ?? 0),
        viewsIg: d?.views_instagram ?? 0,
        viewsTt: d?.views_tiktok ?? 0,
        videos: (d?.videos_instagram ?? 0) + (d?.videos_tiktok ?? 0),
      }
      for (const p of pickedPeople) row[seriesKey(p.id)] = personViews.get(`${date}:${p.id}`) ?? 0
      return row
    })
  }, [daily, byCreatorDaily, defaultFrom, defaultTo, pickedPeople])

  const valueKeys = byPeople
    ? pickedPeople.map((p) => seriesKey(p.id))
    : split
      ? ['viewsIg', 'viewsTt']
      : ['total']
  const plotted = applyYScale(chartData, valueKeys, yScale)
  const dataMax = maxNumeric(plotted, valueKeys)
  const logTicks = LOG_TICKS.filter((t) => t <= Math.max(dataMax, 1) * 1.05)
  const hasChart = chartData.length > 0 && (byPeople || summary.videos > 0)

  function push(patch: NavPatch) {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    params.set('aFrom', patch.from ?? from)
    params.set('aTo', patch.to ?? to)
    params.delete('aCreator')
    params.set('aProject', String(patch.project ?? projectId ?? 'all'))
    params.set('aRole', patch.role ?? role)
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  function openSheet() {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    params.set('aSheet', '1')
    params.set('aFrom', from)
    params.set('aTo', to)
    params.set('aProject', String(projectId ?? 'all'))
    params.set('aRole', role)
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  function selectRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    push({ from: nextFrom, to: nextTo })
  }

  function selectDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return
    selectRange(day, day)
  }

  function selectMonth(yearMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return
    const { start, end } = rankingMonthRange(yearMonth, today)
    selectRange(start, end)
  }

  function togglePick(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const chipClass = (active: boolean) =>
    `h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
    }`
  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`

  const pickedRows = leaderboard.filter((r) => colorOf.has(r.creator_id))
  const totals = byPeople
    ? pickedRows.reduce(
        (acc, r) => ({
          views: acc.views + r.views,
          views_instagram: acc.views_instagram + r.views_instagram,
          views_tiktok: acc.views_tiktok + r.views_tiktok,
          videos: acc.videos + r.videos,
          videos_instagram: acc.videos_instagram + r.videos_instagram,
          videos_tiktok: acc.videos_tiktok + r.videos_tiktok,
        }),
        { views: 0, views_instagram: 0, views_tiktok: 0, videos: 0, videos_instagram: 0, videos_tiktok: 0 },
      )
    : summary
  const peopleWithViews = leaderboard.filter((r) => r.views > 0).length
  const statTiles: Array<{ label: string; value: string; hint?: string; color?: string }> = [
    {
      label: labels.views,
      value: formatNumber(totals.views),
      hint: totals.videos > 0 ? `~${formatNumber(Math.round(totals.views / totals.videos))} per video` : undefined,
    },
    { label: `${labels.views} · ${labels.instagram}`, value: formatNumber(totals.views_instagram), color: IG },
    { label: `${labels.views} · ${labels.tiktok}`, value: formatNumber(totals.views_tiktok), color: TT },
    {
      label: labels.videos,
      value: formatNumber(totals.videos),
      hint: `IG ${totals.videos_instagram} · TT ${totals.videos_tiktok}`,
    },
    byPeople
      ? { label: labels.people, value: `${pickedRows.length}`, hint: 'picked' }
      : {
          label: labels.people,
          value: `${peopleWithViews} / ${leaderboard.length}`,
          hint: 'got views / total',
        },
  ]

  const axisShared = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
      <YAxis
        yAxisId="left"
        scale={yScale === 'log' ? 'log' : 'auto'}
        domain={yScale === 'log' ? [1, dataMax > 1 ? dataMax : 10] : [0, 'auto']}
        allowDataOverflow
        ticks={yScale === 'log' ? logTicks : undefined}
        tick={{ fontSize: 11 }}
        width={56}
        tickFormatter={(v) => formatNumber(Number(v))}
      />
      {showVideos && !byPeople ? (
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={36} />
      ) : null}
      <Tooltip
        formatter={(value, name) =>
          value == null ? ['—', String(name)] : [formatNumber(Number(value)), String(name)]
        }
        labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullDate as string) ?? ''}
      />
      <Legend />
    </>
  )

  const series: Array<{ key: string; name: string; color: string; axis: 'left' | 'right'; dashed?: boolean }> =
    byPeople
      ? pickedPeople.map((p) => ({ key: seriesKey(p.id), name: p.name, color: p.color, axis: 'left' }))
      : [
          ...(split
            ? [
                { key: 'viewsIg', name: `${labels.views} · ${labels.instagram}`, color: IG, axis: 'left' as const },
                { key: 'viewsTt', name: `${labels.views} · ${labels.tiktok}`, color: TT, axis: 'left' as const },
              ]
            : [{ key: 'total', name: `${labels.total} ${labels.views.toLowerCase()}`, color: TOTAL, axis: 'left' as const }]),
          ...(showVideos
            ? [{ key: 'videos', name: labels.videos, color: '#94A3B8', axis: 'right' as const, dashed: true }]
            : []),
        ]

  return (
    <div className="relative flex flex-col gap-4">
      {isPending ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center rounded-lg bg-background/60 pt-24 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm">
            <Loader2 className="size-3.5 animate-spin" />
            {labels.loading}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => push({ project: 'all' })} className={chipClass(projectId == null)}>
          {labels.allProjects}
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => push({ project: p.id })}
            className={chipClass(projectId === p.id)}
          >
            {p.name}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        {(
          [
            ['creator', labels.roleCreators],
            ['reposter', labels.roleReposters],
            ['all', labels.roleAll],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" onClick={() => push({ role: value })} className={chipClass(role === value)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={openSheet}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <Sheet className="size-4" />
          {labels.openSheet}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => selectMonth(currentMonth)} className={chipClass(selectedMonth === currentMonth)}>
          {monthName(currentMonth)}
        </button>
        <button type="button" onClick={() => selectMonth(lastMonth)} className={chipClass(selectedMonth === lastMonth)}>
          {monthName(lastMonth)}
        </button>
        <input
          type="month"
          value={selectedMonth}
          max={currentMonth}
          onChange={(e) => selectMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={labels.month}
        />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <div className="inline-flex items-center gap-1" role="group" aria-label={labels.day}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => selectDay(singleDay ? addDays(singleDay, -1) : stepAnchor)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label={labels.prevDay}
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            value={singleDay}
            max={today}
            onChange={(e) => selectDay(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={labels.day}
          />
          <button
            type="button"
            disabled={isPending || (singleDay !== '' && singleDay >= today)}
            onClick={() => selectDay(singleDay ? addDays(singleDay, 1) : stepAnchor)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label={labels.nextDay}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePresets today={today} from={from} to={to} onSelect={selectRange} />
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (from && to && from <= to) selectRange(from, to)
          }}
        >
          <input
            type="date"
            value={from}
            max={today}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={labels.from}
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={labels.to}
          />
          <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-accent">
            {labels.apply}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {statTiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-lg font-semibold tabular-nums" style={tile.color ? { color: tile.color } : undefined}>
              {tile.value}
            </p>
            {tile.hint ? <p className="text-xs tabular-nums text-muted-foreground">{tile.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {pickedPeople.length === 0 ? (
          <span className="text-xs text-muted-foreground">{labels.pickHint}</span>
        ) : (
          <>
            {pickedPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePick(p.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium"
                style={{ borderColor: p.color, color: p.color }}
              >
                <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                {p.name}
                <X className="size-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicked([])}
              className="h-8 rounded-full border border-border px-3 text-sm hover:bg-accent"
            >
              {labels.clear}
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1" role="group">
          <button type="button" onClick={() => setChartType('line')} className={toggleClass(chartType === 'line')}>
            {labels.chartLine}
          </button>
          <button type="button" onClick={() => setChartType('bar')} className={toggleClass(chartType === 'bar')}>
            {labels.chartBar}
          </button>
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1" role="group">
          <button type="button" onClick={() => setYScale('linear')} className={toggleClass(yScale === 'linear')}>
            {labels.chartLinear}
          </button>
          <button type="button" onClick={() => setYScale('log')} className={toggleClass(yScale === 'log')}>
            {labels.chartLog}
          </button>
        </div>
        {!byPeople ? (
          <>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              {labels.splitPlatforms}
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={showVideos} onChange={(e) => setShowVideos(e.target.checked)} />
              {labels.showVideos}
            </label>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          {!hasChart ? (
            <p className="text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <div className="h-80 w-full text-slate-900 dark:text-slate-100 xl:h-[28rem]">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={plotted} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
                    {axisShared}
                    {series.map((s) => (
                      <Bar
                        key={s.key}
                        yAxisId={s.axis}
                        dataKey={s.key}
                        name={s.name}
                        fill={s.color}
                        opacity={s.dashed ? 0.5 : 1}
                        maxBarSize={byPeople ? 18 : 28}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={plotted} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    {axisShared}
                    {series.map((s) => (
                      <Line
                        key={s.key}
                        yAxisId={s.axis}
                        type="monotone"
                        dataKey={s.key}
                        name={s.name}
                        stroke={s.color}
                        strokeWidth={s.dashed ? 1.5 : 2.25}
                        strokeDasharray={s.dashed ? '5 4' : undefined}
                        dot={chartData.length <= 31 && !s.dashed}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium">{labels.topCreators}</h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {leaderboard.map((row, i) => {
                const color = colorOf.get(row.creator_id)
                return (
                  <li key={row.creator_id}>
                    <button
                      type="button"
                      onClick={() => togglePick(row.creator_id)}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50 ${
                        color ? 'bg-accent/40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="inline-block size-2.5 shrink-0 rounded-full border border-border"
                          style={color ? { backgroundColor: color, borderColor: color } : undefined}
                          aria-hidden
                        />
                        {i + 1}. {row.creator_name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatNumber(row.views)} {labels.views.toLowerCase()} · {row.videos}{' '}
                        {labels.videos.toLowerCase()}
                        <span className="ml-2" style={{ color: IG }}>
                          IG {formatNumber(row.views_instagram)}
                        </span>
                        <span className="ml-2" style={{ color: TT }}>
                          TT {formatNumber(row.views_tiktok)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
