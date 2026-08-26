'use client'

import { useMemo, useState } from 'react'
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
import { addDays } from '@/lib/campaign'
import { formatNumber } from '@/lib/format'
import { colorForCreator } from '@/lib/creator-colors'
import type {
  CreatorDailyViewsRow,
  CreatorViewsRow,
  DailyAnalyticsRow,
} from '@/lib/analytics'
import { DateRangePresets } from '@/components/admin/date-range-presets'

const IG = '#E1306C'
const TT = '#0F766E'

type CreatorOption = { id: number; name: string }
type ChartType = 'line' | 'bar'

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

export function AnalyticsPanel({
  daily,
  creatorDaily,
  byCreatorDaily,
  leaderboard,
  creators,
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
  creators: CreatorOption[]
  selectedCreatorId: number | null
  today: string
  defaultFrom: string
  defaultTo: string
  labels: Labels
}) {
  const [showViews, setShowViews] = useState(true)
  const [showVideos, setShowVideos] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [creatorId, setCreatorId] = useState<number | ''>(
    selectedCreatorId ?? '',
  )
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

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

  const chartData = multiCreator ? multiChartData : platformChartData
  const hasChart = multiCreator
    ? multiChartData.length > 0 && creatorSeries.length > 0
    : platformChartData.length > 0

  function navigate(nextFrom: string, nextTo: string, nextCreator: number | '') {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    params.set('aFrom', nextFrom)
    params.set('aTo', nextTo)
    if (nextCreator === '') params.delete('aCreator')
    else params.set('aCreator', String(nextCreator))
    window.location.search = params.toString()
  }

  const axisShared = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 11 }}
        width={52}
        tickFormatter={(v) => formatNumber(Number(v))}
      />
      {!multiCreator && showVideos ? (
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={36} />
      ) : null}
      <Tooltip
        formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name)]}
        labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullDate as string) ?? ''}
      />
      <Legend />
    </>
  )

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div
          className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="group"
          aria-label="Chart type"
        >
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              chartType === 'line'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {labels.chartLine}
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {labels.chartBar}
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

      {!hasChart ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                {axisShared}
                {multiCreator
                  ? creatorSeries.map((c) => (
                      <Bar
                        key={c.id}
                        yAxisId="left"
                        dataKey={seriesKey(c.id)}
                        name={c.name}
                        fill={colorForCreator(c.id)}
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
                            isAnimationActive={false}
                          />
                        ) : null}
                        {showViews ? (
                          <Bar
                            yAxisId="left"
                            dataKey="viewsTt"
                            name={`${labels.views} · ${labels.tiktok}`}
                            fill={TT}
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
                            isAnimationActive={false}
                          />
                        ) : null}
                      </>
                    )}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                        strokeWidth={2}
                        dot={false}
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
                            strokeWidth={2}
                            dot={false}
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
                            strokeWidth={2}
                            dot={false}
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

      <div>
        <h3 className="mb-2 text-sm font-medium">{labels.topCreators}</h3>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {leaderboard.map((row, i) => {
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
  )
}
