import type { LeagueRow } from '@/lib/ranking-types'

/** Miqat reposter views contest window and bonus structure. */
export const CONTEST = {
  id: 'miqat-views-sep2026',
  name: 'Miqat Contest',
  from: '2026-09-23',
  to: '2026-10-01',
  /** Podium bonus in SAR for ranks 1–3. */
  podiumSar: [15, 10, 5] as const,
  viewsPerBonusUnit: 2000,
  bonusSarPerUnit: 2,
} as const

export type ContestPlatformMode = 'both' | 'instagram' | 'tiktok'

export function isContestRange(from: string, to: string): boolean {
  return from === CONTEST.from && to === CONTEST.to
}

/** Whether the contest window is live for a calendar day (inclusive). */
export function isContestLive(today: string): boolean {
  return today >= CONTEST.from && today <= CONTEST.to
}

/** Views bonus: every 2,000 views → 2 SAR (Top 3 only). */
export function contestViewsBonusSar(views: number): number {
  if (views <= 0) return 0
  return Math.floor(views / CONTEST.viewsPerBonusUnit) * CONTEST.bonusSarPerUnit
}

/** Estimated total for a podium place; null outside Top 3. */
export function contestPrizeEstimate(
  rank: number,
  views: number,
): {
  podium: number
  viewsBonus: number
  total: number
} | null {
  if (rank < 1 || rank > CONTEST.podiumSar.length) return null
  const podium = CONTEST.podiumSar[rank - 1]!
  const viewsBonus = contestViewsBonusSar(views)
  return { podium, viewsBonus, total: podium + viewsBonus }
}

function metricFor(row: LeagueRow, mode: ContestPlatformMode): number {
  if (mode === 'instagram') return row.viewsInstagram
  if (mode === 'tiktok') return row.viewsTiktok
  return row.views
}

/** Re-rank league rows for Both / Instagram / TikTok (Both uses combined views). */
export function rankContestRows(
  rows: LeagueRow[],
  mode: ContestPlatformMode,
): LeagueRow[] {
  const ordered = [...rows].sort((a, b) => {
    const diff = metricFor(b, mode) - metricFor(a, mode)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
  return ordered.map((row, i) => {
    const views = metricFor(row, mode)
    return {
      ...row,
      rank: i + 1,
      views,
      viewsToNext:
        i === 0 ? null : Math.max(0, metricFor(ordered[i - 1]!, mode) - views),
    }
  })
}
