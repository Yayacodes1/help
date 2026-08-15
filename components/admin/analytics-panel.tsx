'use client'

import { useMemo, useState } from 'react'
import {
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
import type { CreatorViewsRow, DailyAnalyticsRow } from '@/lib/analytics'

const IG = '#E1306C'
const TT = '#0F766E'

type CreatorOption = { id: number; name: string }

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

export function AnalyticsPanel({
  daily,
  creatorDaily,
  leaderboard,
  creators,
  selectedCreatorId,
  defaultFrom,
  defaultTo,
  labels,
}: {
  daily: DailyAnalyticsRow[]
  creatorDaily: DailyAnalyticsRow[]
  leaderboard: CreatorViewsRow[]
  creators: CreatorOption[]
  selectedCreatorId: number | null
  defaultFrom: string
  defaultTo: string
  labels: Labels
}) {
  const [showViews, setShowViews] = useState(true)
  const [showVideos, setShowVideos] = useState(false)
  const [creatorId, setCreatorId] = useState<number | ''>(
    selectedCreatorId ?? '',
  )
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

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

  const chartData = useMemo(() => {
    return filteredDaily.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      viewsIg: d.views_instagram,
      viewsTt: d.views_tiktok,
      videosIg: d.videos_instagram,
      videosTt: d.videos_tiktok,
    }))
  }, [filteredDaily])

  const selectedCreator = creators.find(
    (c) => c.id === (selectedCreatorId ?? creatorId),
  )

  function navigate(nextFrom: string, nextTo: string, nextCreator: number | '') {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    params.set('aFrom', nextFrom)
    params.set('aTo', nextTo)
    if (nextCreator === '') params.delete('aCreator')
    else params.set('aCreator', String(nextCreator))
    window.location.search = params.toString()
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap gap-4 text-sm">
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
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                width={52}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              {showVideos && (
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={36} />
              )}
              <Tooltip
                formatter={(value, name) => [
                  formatNumber(Number(value ?? 0)),
                  String(name),
                ]}
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload?.fullDate as string) ?? ''
                }
              />
              <Legend />
              {showViews && (
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
              )}
              {showViews && (
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
              )}
              {showVideos && (
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
              )}
              {showVideos && (
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
              )}
            </LineChart>
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
                    <span className="font-medium">
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
