/** Client-safe fitness types + sort (no DB / server-only). */

export type FitnessTier = 'protected' | 'probation' | null

export type FitnessAction = 'keep' | 'watch' | 'cut'

export type FitnessSort =
  | 'number'
  | 'score'
  | 'quwa'
  | 'views'
  | 'consistency'
  | 'cut'

export type FitnessRow = {
  creatorId: number
  name: string
  projectId: number | null
  projectName: string | null
  views: number
  videos: number
  postDays: number
  daySpan: number
  consistency: number
  score: number
  quwa: number
  action: FitnessAction
  tier: FitnessTier
  probationStartedOn: string | null
  paused: boolean
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
  copy.sort((a, b) => {
    switch (sort) {
      case 'number':
        return a.name.localeCompare(b.name)
      case 'score':
        return a.score - b.score || a.quwa - b.quwa
      case 'quwa':
        return a.quwa - b.quwa || a.views - b.views
      case 'views':
        return b.views - a.views || a.name.localeCompare(b.name)
      case 'consistency':
        return a.consistency - b.consistency || a.views - b.views
      case 'cut':
        return (
          actionOrder[a.action] - actionOrder[b.action] ||
          a.quwa - b.quwa ||
          a.views - b.views
        )
      default:
        return 0
    }
  })
  return copy
}
