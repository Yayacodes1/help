'use client'

import { useMemo, useState, Fragment } from 'react'
import { ChevronDown, Minus, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { PersonHandlesLine } from '@/components/person-handles'
import type { LeagueBoard, LeagueRow } from '@/lib/ranking-types'

function Movement({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground" title="No change">
        <Minus className="size-3.5" />
      </span>
    )
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600" title={`Up ${delta}`}>
        <TrendingUp className="size-3.5" />
        <span className="tabular-nums text-xs">{delta}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-rose-600" title={`Down ${Math.abs(delta)}`}>
      <TrendingDown className="size-3.5" />
      <span className="tabular-nums text-xs">{Math.abs(delta)}</span>
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const w = 56
  const h = 18
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
      const y = h - (v / max) * (h - 2) - 1
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible text-primary" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  )
}

function RowDetail({
  board,
  row,
}: {
  board: LeagueBoard
  row: LeagueRow
}) {
  const history = board.history[row.creatorId] ?? []
  return (
    <div className="space-y-2 bg-muted/30 px-3 py-3 text-xs">
      <p className="text-muted-foreground">
        {row.viewsToNext != null && row.viewsToNext > 0
          ? `${formatNumber(row.viewsToNext)} views to next rank`
          : 'Top of the table'}
        {' · '}
        avg {formatNumber(row.avgViews)} views/video
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">MTD views</th>
              <th className="py-1 font-medium">Rank</th>
              <th className="py-1 font-medium">Move</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d.date} className="border-t border-border/60">
                <td className="py-1 tabular-nums">{d.date.slice(5)}</td>
                <td className="py-1 tabular-nums">{formatNumber(d.views)}</td>
                <td className="py-1 tabular-nums">{d.rank}</td>
                <td className="py-1">
                  <Movement delta={d.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RankingBoard({
  board,
  highlightId,
  collapsedLimit = 5,
  showSearch = true,
  labels,
}: {
  board: LeagueBoard
  highlightId?: number | null
  collapsedLimit?: number | null
  showSearch?: boolean
  labels: {
    title: string
    empty: string
    expand: string
    collapse: string
    search: string
    rank: string
    views: string
    videos: string
  }
}) {
  const [expanded, setExpanded] = useState(collapsedLimit == null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().replace(/^@+/, '').toLowerCase()
    if (!needle) return board.rows
    return board.rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.tiktokUsername ?? '').toLowerCase().includes(needle) ||
        (r.instagramUsername ?? '').toLowerCase().includes(needle)
      )
    })
  }, [board.rows, q])

  const visible =
    collapsedLimit != null && !expanded ? filtered.slice(0, collapsedLimit) : filtered

  if (board.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.empty}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{labels.title}</h3>
          <p className="text-xs text-muted-foreground">
            {board.from.slice(5)} → {board.to.slice(5)} · monthly views
          </p>
        </div>
        {showSearch ? (
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={labels.search}
              className="h-9 w-44 rounded-lg border border-input bg-background pl-8 pr-2 text-sm"
            />
          </label>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{labels.rank}</th>
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">{labels.views}</th>
              <th className="px-3 py-2 font-medium">IG</th>
              <th className="px-3 py-2 font-medium">TT</th>
              {board.projects.map((p) => (
                <th key={p.id} className="px-3 py-2 font-medium">
                  {p.name}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">{labels.videos}</th>
              <th className="px-3 py-2 font-medium">7d</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const mine = highlightId != null && row.creatorId === highlightId
              const open = openId === row.creatorId
              return (
                <Fragment key={row.creatorId}>
                  <tr className={`border-b border-border ${mine ? 'bg-primary/5' : ''}`}>
                    <td className="px-3 py-2 font-semibold tabular-nums">{row.rank}</td>
                    <td className="px-1 py-2">
                      <Movement delta={row.delta} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : row.creatorId)}
                        className="flex items-center gap-1 text-left font-medium underline-offset-4 hover:underline"
                      >
                        {row.name}
                        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      <PersonHandlesLine
                        person={{
                          tiktok_username: row.tiktokUsername,
                          instagram_username: row.instagramUsername,
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{formatNumber(row.views)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {formatNumber(row.viewsInstagram)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {formatNumber(row.viewsTiktok)}
                    </td>
                    {board.projects.map((p) => (
                      <td key={p.id} className="px-3 py-2 tabular-nums text-muted-foreground">
                        {formatNumber(row.viewsByProject[p.id] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.videos}</td>
                    <td className="px-3 py-2">
                      <Sparkline values={row.sparkline} />
                    </td>
                  </tr>
                  {open ? (
                    <tr key={`${row.creatorId}-detail`} className="border-b border-border">
                      <td colSpan={8 + board.projects.length} className="p-0">
                        <RowDetail board={board} row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {collapsedLimit != null && filtered.length > collapsedLimit ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded ? labels.collapse : `${labels.expand} (${filtered.length})`}
        </button>
      ) : null}
    </div>
  )
}
