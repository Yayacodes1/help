/** Client-safe fitness types + sort (no DB / server-only). */

export type FitnessTier = 'protected' | 'probation' | null

/** Verdict for cutting fat — keep / watch / cut. */
export type FitnessAction = 'keep' | 'watch' | 'cut'

export type FitnessSort =
  | 'cut_first'
  | 'worst_roi'
  | 'best_roi'
  | 'views_high'
  | 'views_low'
  | 'newest'
  | 'longest'
  | 'name'

export type FitnessRow = {
  creatorId: number
  name: string
  projectId: number | null
  projectName: string | null
  views: number
  videos: number
  postDays: number
  daySpan: number
  /** Posting rate in the selected window (post days / window days). */
  consistency: number
  /** Distinct post days that fell inside any contract. */
  allPostDays: number
  /** Sum of calendar days across all contracts (capped at today). */
  allContractDays: number
  /** Posting rate across all contracts (allPostDays / allContractDays). */
  allConsistency: number
  /** Single strength 0–100 (views + posts + ROI). Replaces old score + قوة split. */
  strength: number
  /** SAR paid in the selected window. */
  paid: number
  /** Cost per 1,000 views — lower is better ROI. null if no views or no pay. */
  costPer1k: number | null
  /** Views per 1 SAR paid — higher is better. null if unpaid. */
  viewsPerSar: number | null
  /** Calendar days from first contract / join date through today. */
  daysWithUs: number
  joinedOn: string | null
  action: FitnessAction
  tier: FitnessTier
  probationStartedOn: string | null
  /** Always false on the board — fired people are excluded. */
  fired: boolean
  viewsShare: number
}

export type FitnessBoard = {
  from: string
  to: string
  today: string
  totalViews: number
  top15Views: number
  top15Share: number
  rows: FitnessRow[]
}

export function sortFitnessRows(rows: FitnessRow[], sort: FitnessSort): FitnessRow[] {
  const copy = [...rows]
  const actionOrder: Record<FitnessAction, number> = { cut: 0, watch: 1, keep: 2 }
  const cost = (r: FitnessRow) => (r.costPer1k == null ? Number.POSITIVE_INFINITY : r.costPer1k)
  const roi = (r: FitnessRow) => (r.viewsPerSar == null ? -1 : r.viewsPerSar)

  copy.sort((a, b) => {
    switch (sort) {
      case 'cut_first':
        return (
          actionOrder[a.action] - actionOrder[b.action] ||
          a.strength - b.strength ||
          cost(b) - cost(a) ||
          a.views - b.views
        )
      case 'worst_roi':
        // High cost/1k first (expensive views); unpaid with views sink to bottom of "worst"
        return cost(b) - cost(a) || a.views - b.views || a.name.localeCompare(b.name)
      case 'best_roi':
        return roi(b) - roi(a) || b.views - a.views || a.name.localeCompare(b.name)
      case 'views_high':
        return b.views - a.views || a.name.localeCompare(b.name)
      case 'views_low':
        return a.views - b.views || a.name.localeCompare(b.name)
      case 'newest':
        return a.daysWithUs - b.daysWithUs || b.views - a.views
      case 'longest':
        return b.daysWithUs - a.daysWithUs || b.views - a.views
      case 'name':
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })
  return copy
}
