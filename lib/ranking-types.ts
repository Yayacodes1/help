export type LeagueProject = { id: number; name: string }

export type LeagueRow = {
  creatorId: number
  name: string
  tiktokUsername: string | null
  instagramUsername: string | null
  rank: number
  previousRank: number | null
  /** previousRank - rank; positive = moved up the table */
  delta: number | null
  views: number
  viewsInstagram: number
  viewsTiktok: number
  videos: number
  avgViews: number
  viewsByProject: Record<number, number>
  sparkline: number[]
  viewsToNext: number | null
}

export type LeagueDayPoint = {
  date: string
  rank: number
  views: number
  delta: number | null
}

export type LeagueBoard = {
  from: string
  to: string
  yesterday: string
  projects: LeagueProject[]
  rows: LeagueRow[]
  history: Record<number, LeagueDayPoint[]>
}
