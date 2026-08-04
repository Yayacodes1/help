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
  showCreator: string
  topCreators: string
  empty: string
  from: string
  to: string
  apply: string
}

function indexDaily(rows: DailyAnalyticsRow[]) {
  const map = new Map<string, DailyAnalyticsRow>()
  for (const r of rows) map.set(r.date, r)
  return map
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
  const [showCreator, setShowCreator] = useState(Boolean(selectedCreatorId))
  const [creatorId, setCreatorId] = useState<number | ''>(
    selectedCreatorId ?? '',
  )
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const filteredDaily = useMemo(
    () => daily.filter((d) => d.date >= from && d.date <= to),
    [daily, from, to],
  )

  const creatorMap = useMemo(() => indexDaily(creatorDaily), [creatorDaily])

  const chartData = useMemo(() => {
    return filteredDaily.map((d) => {
      const c = creatorMap.get(d.date)
      return {
        date: d.date.slice(5),
        fullDate: d.date,
        viewsIg: d.views_instagram,
        viewsTt: d.views_tiktok,
        videosIg: d.videos_instagram,
        videosTt: d.videos_tiktok,
        creatorViewsIg: c?.views_instagram ?? 0,
        creatorViewsTt: c?.views_tiktok ?? 0,
      }
    })
  }, [filteredDaily, creatorMap])

  const selectedCreator = creators.find((c) => c.id === creatorId)
  const top = leaderboard.slice(0, 6)

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const params = new URLSearchParams(window.location.search)
          params.set('panel', 'analytics')
          params.set('aFrom', from)
          params.set('aTo', to)
          if (creatorId === '') params.delete('aCreator')
          else params.set('aCreator', String(creatorId))
          window.location.search = params.toString()
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
              if (next !== '') setShowCreator(true)
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
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCreator}
            onChange={(e) => setShowCreator(e.target.checked)}
          />
          {labels.showCreator}
          {selectedCreator ? ` (${selectedCreator.name})` : ''}
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
              {showCreator && creatorId !== '' && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="creatorViewsIg"
                  name={`${selectedCreator?.name ?? labels.creator} · ${labels.instagram}`}
                  stroke={IG}
                  strokeWidth={2.5}
                  strokeOpacity={0.45}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {showCreator && creatorId !== '' && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="creatorViewsTt"
                  name={`${selectedCreator?.name ?? labels.creator} · ${labels.tiktok}`}
                  stroke={TT}
                  strokeWidth={2.5}
                  strokeOpacity={0.45}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {showCreator && creatorId === '' && (
        <p className="text-xs text-muted-foreground">
          Choose a creator and tap Apply to plot their Instagram / TikTok views.
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">{labels.topCreators}</h3>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {top.map((row, i) => (
              <li
                key={row.creator_id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
