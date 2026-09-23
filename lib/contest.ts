/** Reposter views contest window and bonus structure. */
export const CONTEST = {
  id: 'reposter-views-sep2026',
  from: '2026-09-23',
  to: '2026-10-01',
  /** Podium bonus in SAR for ranks 1–3. */
  podiumSar: [15, 10, 5] as const,
  viewsPerBonusUnit: 2000,
  bonusSarPerUnit: 2,
} as const

export function isContestRange(from: string, to: string): boolean {
  return from === CONTEST.from && to === CONTEST.to
}

/** Views bonus: every 2,000 views → 2 SAR (Top 3 only). */
export function contestViewsBonusSar(views: number): number {
  if (views <= 0) return 0
  return Math.floor(views / CONTEST.viewsPerBonusUnit) * CONTEST.bonusSarPerUnit
}

/** Estimated total for a podium place; null outside Top 3. */
export function contestPrizeEstimate(rank: number, views: number): {
  podium: number
  viewsBonus: number
  total: number
} | null {
  if (rank < 1 || rank > CONTEST.podiumSar.length) return null
  const podium = CONTEST.podiumSar[rank - 1]!
  const viewsBonus = contestViewsBonusSar(views)
  return { podium, viewsBonus, total: podium + viewsBonus }
}
