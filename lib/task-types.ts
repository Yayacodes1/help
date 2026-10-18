export type LeaderTask = {
  id: number
  leader_id: number
  title: string
  created_at: string
  created_on: string
  archived_at: string | null
  pinned_at: string | null
}

export type TaskDaySummary = { day: string; done: number; total: number }
