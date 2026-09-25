'use client'

import { useMemo, useState } from 'react'
import { Award, Gem, Medal } from 'lucide-react'
import {
  rankContestRows,
  type ContestPlatformMode,
} from '@/lib/contest'
import type { LeagueRow } from '@/lib/ranking-types'

const PODIUM = [
  {
    rank: 1,
    labelKey: 'diamond' as const,
    Icon: Gem,
    shell: 'border-[#9ad4ef]/70 bg-gradient-to-br from-[#e8f7ff] to-[#cfefff]',
    icon: 'text-[#3aa0c8]',
    badge: 'bg-[#5eb8d9] text-white',
  },
  {
    rank: 2,
    labelKey: 'gold' as const,
    Icon: Award,
    shell: 'border-[#e8c76a]/80 bg-gradient-to-br from-[#fff8e1] to-[#ffe9a8]',
    icon: 'text-[#c9a227]',
    badge: 'bg-[#d4af37] text-white',
  },
  {
    rank: 3,
    labelKey: 'silver' as const,
    Icon: Medal,
    shell: 'border-[#c0c7d1]/80 bg-gradient-to-br from-[#f4f6f8] to-[#dde3ea]',
    icon: 'text-[#8a93a0]',
    badge: 'bg-[#9aa3b0] text-white',
  },
] as const

const MODES: ContestPlatformMode[] = ['both', 'instagram', 'tiktok']

export function ContestPodium({
  rows,
  highlightId,
  labels,
}: {
  rows: LeagueRow[]
  highlightId?: number | null
  labels: {
    title: string
    empty: string
    diamond: string
    gold: string
    silver: string
    both: string
    instagram: string
    tiktok: string
  }
}) {
  const [mode, setMode] = useState<ContestPlatformMode>('both')
  const ranked = useMemo(() => rankContestRows(rows, mode), [rows, mode])
  const top3 = ranked.filter((r) => r.rank >= 1 && r.rank <= 3).slice(0, 3)

  const modeLabel = (m: ContestPlatformMode) =>
    m === 'both' ? labels.both : m === 'instagram' ? labels.instagram : labels.tiktok

  return (
    <section className="flex max-h-[30vh] flex-col gap-2 overflow-hidden rounded-2xl border border-[#e8cfc0] bg-[#fff8f3] p-3 shadow-sm">
      <h3 className="shrink-0 text-sm font-semibold text-[#9a0d18]">{labels.title}</h3>
      <div className="flex shrink-0 gap-1 rounded-lg bg-[#f5e6dc] p-0.5">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              mode === m
                ? 'bg-white text-[#9a0d18] shadow-sm'
                : 'text-[#a05a55] hover:text-[#9a0d18]'
            }`}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>
      {top3.length === 0 ? (
        <p className="text-xs text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {PODIUM.map((slot) => {
            const row = top3.find((r) => r.rank === slot.rank)
            if (!row) return null
            const mine = highlightId != null && row.creatorId === highlightId
            const label =
              slot.labelKey === 'diamond'
                ? labels.diamond
                : slot.labelKey === 'gold'
                  ? labels.gold
                  : labels.silver
            const Icon = slot.Icon
            return (
              <li
                key={slot.rank}
                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${slot.shell} ${
                  mine ? 'ring-2 ring-[#c41e2a]/35' : ''
                }`}
              >
                <span
                  className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${slot.badge}`}
                  title={label}
                >
                  <Icon className="size-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    #{slot.rank} · @{row.loginHandle}
                  </p>
                  <p className={`text-[11px] font-medium uppercase tracking-wide ${slot.icon}`}>
                    {label}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
