export type LeaderTask = {
  id: number
  leader_id: number
  title: string
  created_at: string
  archived_at: string | null
}

export type TaskDaySummary = { day: string; done: number; total: number }
