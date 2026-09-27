'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Sheet } from 'lucide-react'
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
import { colorForCreator } from '@/lib/creator-colors'
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
const LOG_TICKS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]

type CreatorOption = { id: number; name: string }
type ChartType = 'line' | 'bar'
type YScale = 'log' | 'linear'

type Labels = {
  views: string
  videos: string
  creator: string
  allCreators: string
  instagram: string
  tiktok: string
  showViews: string
  showVideos: string
  topCreators: string
  empty: string
  from: string
  to: string
  apply: string
  showing: string
  chartLine: string
  chartBar: string
  chartLog: string
  chartLinear: string
  allProjects: string
  chooseProject: string
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
}

type NavPatch = {
  from?: string
  to?: string
  creator?: number | ''
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

function indexDaily(rows: DailyAnalyticsRow[]) {
  const map = new Map<string, DailyAnalyticsRow>()
  for (const r of rows) map.set(r.date, r)
  return map
}

function fillDays(
  rows: DailyAnalyticsRow[],
  from: string,
  to: string,
): DailyAnalyticsRow[] {
  const map = indexDaily(rows)
  const out: DailyAnalyticsRow[] = []
  if (!from || !to || from > to) return rows
  let d = from
  while (d <= to) {
    out.push(
      map.get(d) ?? {
        date: d,
        views_instagram: 0,
        views_tiktok: 0,
        videos_instagram: 0,
        videos_tiktok: 0,
      },
    )
    d = addDays(d, 1)
  }
  return out
}

function eachDate(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  let d = from
  while (d <= to) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

function seriesKey(creatorId: number) {
  return `c${creatorId}`
}

/** Log scale cannot plot 0; skip those points so small values stay readable. */
function plotValue(n: number, yScale: YScale): number | null {
  if (yScale === 'linear') return n
  if (n <= 0) return null
  return n
}

function applyYScale(
  rows: Array<Record<string, string | number>>,
  numericKeys: string[],
  yScale: YScale,
): Array<Record<string, string | number | null>> {
  if (yScale === 'linear') return rows
  return rows.map((row) => {
    const next: Record<string, string | number | null> = { ...row }
    for (const key of numericKeys) {
      const v = row[key]
      next[key] = typeof v === 'number' ? plotValue(v, yScale) : v
    }
    return next
  })
}

function maxNumeric(
  rows: Array<Record<string, string | number | null>>,
  keys: string[],
): number {
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
  creatorDaily,
  byCreatorDaily,
  leaderboard,
  summary,
  creators,
  projects,
  projectId,
  role,
  selectedCreatorId,
  today,
  defaultFrom,
  defaultTo,
  labels,
}: {
  daily: DailyAnalyticsRow[]
  creatorDaily: DailyAnalyticsRow[]
  byCreatorDaily: CreatorDailyViewsRow[]
  leaderboard: CreatorViewsRow[]
  summary: ViewsSummary
  creators: CreatorOption[]
  projects: Array<{ id: number; name: string }>
  projectId: number | null
  role: RoleFilter
  selectedCreatorId: number | null
  today: string
  defaultFrom: string
  defaultTo: string
  labels: Labels
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showViews, setShowViews] = useState(true)
  const [showVideos, setShowVideos] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [yScale, setYScale] = useState<YScale>('log')
  const [creatorId, setCreatorId] = useState<number | ''>(
    selectedCreatorId ?? '',
  )
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const serverKey = `${defaultFrom}|${defaultTo}|${selectedCreatorId ?? ''}`
  const [syncedKey, setSyncedKey] = useState(serverKey)
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey)
    setFrom(defaultFrom)
    setTo(defaultTo)
    setCreatorId(selectedCreatorId ?? '')
  }

  const currentMonth = today.slice(0, 7)
  const lastMonth = shiftYearMonth(currentMonth, -1)
  const selectedMonth = monthOfRange(from, to, today)
  const singleDay = from === to ? from : ''
  const stepAnchor = singleDay || (to > today ? today : to)

  const multiCreator = selectedCreatorId == null
  const sourceDaily = selectedCreatorId != null ? creatorDaily : daily

  const filteredDaily = useMemo(
    () =>
      fillDays(
        sourceDaily.filter((d) => d.date >= from && d.date <= to),
        from,
        to,
      ),
    [sourceDaily, from, to],
  )

  const platformChartData = useMemo(() => {
    return filteredDaily.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      viewsIg: d.views_instagram,
      viewsTt: d.views_tiktok,
      videosIg: d.videos_instagram,
      videosTt: d.videos_tiktok,
    }))
  }, [filteredDaily])

  const creatorSeries = useMemo(() => {
    const filtered = byCreatorDaily.filter((r) => r.date >= from && r.date <= to)
    const byId = new Map<number, { id: number; name: string; total: number }>()
    for (const r of filtered) {
      const prev = byId.get(r.creator_id)
      if (prev) prev.total += r.views
      else byId.set(r.creator_id, { id: r.creator_id, name: r.creator_name, total: r.views })
    }
    return [...byId.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [byCreatorDaily, from, to])

  const multiChartData = useMemo(() => {
    const dates = eachDate(from, to)
    const lookup = new Map<string, number>()
    for (const r of byCreatorDaily) {
      if (r.date < from || r.date > to) continue
      lookup.set(`${r.date}:${r.creator_id}`, r.views)
    }
    return dates.map((date) => {
      const row: Record<string, string | number> = {
        date: date.slice(5),
        fullDate: date,
      }
      for (const c of creatorSeries) {
        row[seriesKey(c.id)] = lookup.get(`${date}:${c.id}`) ?? 0
      }
      return row
    })
  }, [byCreatorDaily, creatorSeries, from, to])

  const selectedCreator = creators.find(
    (c) => c.id === (selectedCreatorId ?? creatorId),
  )

  const numericKeys = useMemo(() => {
    if (multiCreator) return creatorSeries.map((c) => seriesKey(c.id))
    const keys: string[] = []
    if (showViews) keys.push('viewsIg', 'viewsTt')
    if (showVideos) keys.push('videosIg', 'videosTt')
    return keys
  }, [multiCreator, creatorSeries, showViews, showVideos])

  const chartData = useMemo(() => {
    const base = multiCreator ? multiChartData : platformChartData
    return applyYScale(base, numericKeys, yScale)
  }, [multiCreator, multiChartData, platformChartData, numericKeys, yScale])

  const dataMax = useMemo(
    () => maxNumeric(chartData, numericKeys),
    [chartData, numericKeys],
  )

  const logTicks = useMemo(
    () => LOG_TICKS.filter((t) => t <= Math.max(dataMax, 1) * 1.05),
    [dataMax],
  )

  const hasChart = multiCreator
    ? multiChartData.length > 0 && creatorSeries.length > 0
    : platformChartData.length > 0

  function push(patch: NavPatch) {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    params.set('aFrom', patch.from ?? from)
    params.set('aTo', patch.to ?? to)
    const nextCreator = patch.creator ?? creatorId
    if (nextCreator === '') params.delete('aCreator')
    else params.set('aCreator', String(nextCreator))
    params.set('aProject', String(patch.project ?? projectId ?? 'all'))
    params.set('aRole', patch.role ?? role)
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  function navigate(nextFrom: string, nextTo: string, nextCreator: number | '') {
    push({ from: nextFrom, to: nextTo, creator: nextCreator })
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

  function selectDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return
    setFrom(day)
    setTo(day)
    push({ from: day, to: day })
  }

  function selectMonth(yearMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return
    const { start, end } = rankingMonthRange(yearMonth, today)
    setFrom(start)
    setTo(end)
    push({ from: start, to: end })
  }

  const chipClass = (active: boolean) =>
    `h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border hover:bg-accent'
    }`

  const selectedRow =
    selectedCreatorId != null
      ? leaderboard.find((r) => r.creator_id === selectedCreatorId)
      : undefined
  const totals = selectedRow ?? summary
  const peopleWithViews = leaderboard.filter((r) => r.views > 0).length
  const statTiles: Array<{ label: string; value: string; hint?: string; color?: string }> = [
    { label: labels.views, value: formatNumber(totals.views) },
    {
      label: `${labels.views} · ${labels.instagram}`,
      value: formatNumber(totals.views_instagram),
      color: IG,
    },
    {
      label: `${labels.views} · ${labels.tiktok}`,
      value: formatNumber(totals.views_tiktok),
      color: TT,
    },
    {
      label: labels.videos,
      value: formatNumber(totals.videos),
      hint: `IG ${totals.videos_instagram} · TT ${totals.videos_tiktok}`,
    },
  ]
  if (!selectedRow) {
    statTiles.push({
      label: labels.people,
      value: `${peopleWithViews} / ${leaderboard.length}`,
    })
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`

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
      {!multiCreator && showVideos ? (
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={36} />
      ) : null}
      <Tooltip
        formatter={(value, name) => {
          if (value == null) return ['—', String(name)]
          return [formatNumber(Number(value)), String(name)]
        }}
        labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullDate as string) ?? ''}
      />
      <Legend />
    </>
  )

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
        <button
          type="button"
          onClick={() => push({ project: 'all', creator: '' })}
          className={chipClass(projectId == null)}
        >
          {labels.allProjects}
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => push({ project: p.id, creator: '' })}
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
          <button
            key={value}
            type="button"
            onClick={() => push({ role: value, creator: '' })}
            className={chipClass(role === value)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={openSheet}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/20"
          title="Full-screen day-by-day sheet with downloads, charts and CSV export"
        >
          <Sheet className="size-4" />
          {labels.openSheet}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectMonth(currentMonth)}
          className={chipClass(selectedMonth === currentMonth)}
        >
          {monthName(currentMonth)}
        </button>
        <button
          type="button"
          onClick={() => selectMonth(lastMonth)}
          className={chipClass(selectedMonth === lastMonth)}
        >
          {monthName(lastMonth)}
        </button>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          {labels.month}
          <input
            type="month"
            value={selectedMonth}
            max={currentMonth}
            onChange={(e) => selectMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <div className="inline-flex items-center gap-1" role="group" aria-label={labels.day}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => selectDay(singleDay ? addDays(singleDay, -1) : stepAnchor)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            title={labels.prevDay}
            aria-label={labels.prevDay}
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            value={singleDay}
            max={today}
            onChange={(e) => selectDay(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            aria-label={labels.day}
          />
          <button
            type="button"
            disabled={isPending || (singleDay !== '' && singleDay >= today)}
            onClick={() => selectDay(singleDay ? addDays(singleDay, 1) : stepAnchor)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            title={labels.nextDay}
            aria-label={labels.nextDay}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePresets
          today={today}
          from={from}
          to={to}
          onSelect={(nextFrom, nextTo) => {
            setFrom(nextFrom)
            setTo(nextTo)
            navigate(nextFrom, nextTo, creatorId)
          }}
        />
      </div>
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(from, to, creatorId)
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.from}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.to}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.creator}
          <select
            value={creatorId === '' ? '' : String(creatorId)}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : ''
              setCreatorId(next)
              navigate(from, to, next)
            }}
            className="min-w-40 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{labels.allCreators}</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
        >
          {labels.apply}
        </button>
      </form>

      {selectedCreator ? (
        <p className="text-sm text-muted-foreground">
          {labels.showing} @{selectedCreator.name}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {statTiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p
              className="text-lg font-semibold tabular-nums"
              style={tile.color ? { color: tile.color } : undefined}
            >
              {tile.value}
            </p>
            {tile.hint ? (
              <p className="text-xs tabular-nums text-muted-foreground">{tile.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div
          className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="group"
          aria-label="Chart type"
        >
          <button type="button" onClick={() => setChartType('line')} className={toggleClass(chartType === 'line')}>
            {labels.chartLine}
          </button>
          <button type="button" onClick={() => setChartType('bar')} className={toggleClass(chartType === 'bar')}>
            {labels.chartBar}
          </button>
        </div>
        <div
          className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="group"
          aria-label="Y axis scale"
        >
          <button type="button" onClick={() => setYScale('log')} className={toggleClass(yScale === 'log')}>
            {labels.chartLog}
          </button>
          <button type="button" onClick={() => setYScale('linear')} className={toggleClass(yScale === 'linear')}>
            {labels.chartLinear}
          </button>
        </div>
        {!multiCreator ? (
          <>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showViews}
                onChange={(e) => setShowViews(e.target.checked)}
              />
              {labels.showViews}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showVideos}
                onChange={(e) => setShowVideos(e.target.checked)}
              />
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
        <div className="h-80 w-full xl:h-[28rem]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                barCategoryGap="18%"
                barGap={2}
              >
                {axisShared}
                {multiCreator
                  ? creatorSeries.map((c) => (
                      <Bar
                        key={c.id}
                        yAxisId="left"
                        dataKey={seriesKey(c.id)}
                        name={c.name}
                        fill={colorForCreator(c.id)}
                        maxBarSize={18}
                        isAnimationActive={false}
                      />
                    ))
                  : (
                      <>
                        {showViews ? (
                          <Bar
                            yAxisId="left"
                            dataKey="viewsIg"
                            name={`${labels.views} · ${labels.instagram}`}
                            fill={IG}
                            maxBarSize={28}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showViews ? (
                          <Bar
                            yAxisId="left"
                            dataKey="viewsTt"
                            name={`${labels.views} · ${labels.tiktok}`}
                            fill={TT}
                            maxBarSize={28}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showVideos ? (
                          <Bar
                            yAxisId="right"
                            dataKey="videosIg"
                            name={`${labels.videos} · ${labels.instagram}`}
                            fill={IG}
                            opacity={0.55}
                            maxBarSize={28}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showVideos ? (
                          <Bar
                            yAxisId="right"
                            dataKey="videosTt"
                            name={`${labels.videos} · ${labels.tiktok}`}
                            fill={TT}
                            opacity={0.55}
                            maxBarSize={28}
                            isAnimationActive={false}
                          />
                        ) : null}
                      </>
                    )}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                {axisShared}
                {multiCreator
                  ? creatorSeries.map((c) => (
                      <Line
                        key={c.id}
                        yAxisId="left"
                        type="monotone"
                        dataKey={seriesKey(c.id)}
                        name={c.name}
                        stroke={colorForCreator(c.id)}
                        strokeWidth={2.25}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))
                  : (
                      <>
                        {showViews ? (
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="viewsIg"
                            name={`${labels.views} · ${labels.instagram}`}
                            stroke={IG}
                            strokeWidth={2.25}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showViews ? (
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="viewsTt"
                            name={`${labels.views} · ${labels.tiktok}`}
                            stroke={TT}
                            strokeWidth={2.25}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showVideos ? (
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="videosIg"
                            name={`${labels.videos} · ${labels.instagram}`}
                            stroke={IG}
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showVideos ? (
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="videosTt"
                            name={`${labels.videos} · ${labels.tiktok}`}
                            stroke={TT}
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ) : null}
                      </>
                    )}
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
              const rank = i + 1
              const active = selectedCreatorId === row.creator_id
              const color = colorForCreator(row.creator_id)
              return (
                <li key={row.creator_id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(from, to, active ? '' : row.creator_id)
                    }
                    className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50 ${
                      active ? 'bg-accent/40' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                      {rank}. {row.creator_name}
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
