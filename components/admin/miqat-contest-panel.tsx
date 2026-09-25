'use client'

import { useMemo, useState } from 'react'
import { Award, Gem, Medal } from 'lucide-react'
import {
  CONTEST,
  contestPrizeEstimate,
  rankContestRows,
  type ContestPlatformMode,
} from '@/lib/contest'
import { formatNumber } from '@/lib/format'
import type { LeagueBoard } from '@/lib/ranking-types'

const MODES: ContestPlatformMode[] = ['both', 'instagram', 'tiktok']

function MedalBadge({
  rank,
  labels,
}: {
  rank: number
  labels: { diamond: string; gold: string; silver: string }
}) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#5eb8d9] px-2 py-0.5 text-[11px] font-semibold text-white">
        <Gem className="size-3" /> {labels.diamond}
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#d4af37] px-2 py-0.5 text-[11px] font-semibold text-white">
        <Award className="size-3" /> {labels.gold}
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#9aa3b0] px-2 py-0.5 text-[11px] font-semibold text-white">
        <Medal className="size-3" /> {labels.silver}
      </span>
    )
  }
  return null
}

export function MiqatContestPanel({
  board,
  labels,
}: {
  board: LeagueBoard | null
  labels: {
    title: string
    empty: string
    noProject: string
    both: string
    instagram: string
    tiktok: string
    views: string
    videos: string
    rank: string
    prize: string
    diamond: string
    gold: string
    silver: string
  }
}) {
  const [mode, setMode] = useState<ContestPlatformMode>('both')
  const ranked = useMemo(
    () => (board ? rankContestRows(board.rows, mode) : []),
    [board, mode],
  )
  const withViews = ranked.filter((r) => r.views > 0)

  const modeLabel = (m: ContestPlatformMode) =>
    m === 'both' ? labels.both : m === 'instagram' ? labels.instagram : labels.tiktok

  if (!board) {
    return <p className="text-sm text-muted-foreground">{labels.noProject}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{labels.title}</h3>
        <p className="text-xs text-muted-foreground">
          {CONTEST.from.slice(5)} → {CONTEST.to.slice(5)} · Miqat · reposters
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>

      {withViews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {withViews.map((row) => {
            const prize = contestPrizeEstimate(row.rank, row.views)
            return (
              <li
                key={row.creatorId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="tabular-nums text-muted-foreground">#{row.rank}</span>
                  {row.name}
                  <MedalBadge
                    rank={row.rank}
                    labels={{
                      diamond: labels.diamond,
                      gold: labels.gold,
                      silver: labels.silver,
                    }}
                  />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(row.views)} {labels.views.toLowerCase()} · {row.videos}{' '}
                  {labels.videos.toLowerCase()}
                  {prize ? (
                    <span className="ml-2 font-medium text-foreground">
                      {labels.prize} {prize.total} SAR
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
