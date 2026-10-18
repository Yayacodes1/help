import 'server-only'
import { sql } from '@/lib/db'
import type { LeaderTask, TaskDaySummary } from '@/lib/task-types'

export type { LeaderTask, TaskDaySummary }

export async function ensureTaskTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS leader_tasks (
      id SERIAL PRIMARY KEY,
      leader_id INTEGER NOT NULL REFERENCES leaders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS leader_tasks_leader_idx ON leader_tasks (leader_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS reposter_task_checks (
      task_id INTEGER NOT NULL REFERENCES leader_tasks(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (task_id, creator_id, day)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS reposter_task_checks_creator_day_idx ON reposter_task_checks (creator_id, day)`
}

export async function listLeaderTasks(leaderId: number, opts: { includeArchived?: boolean } = {}): Promise<LeaderTask[]> {
  await ensureTaskTables()
  const rows = opts.includeArchived
    ? await sql`
        SELECT id, leader_id, title, created_at::text AS created_at, archived_at::text AS archived_at
        FROM leader_tasks
        WHERE leader_id = ${leaderId}
        ORDER BY archived_at NULLS FIRST, id ASC
      `
    : await sql`
        SELECT id, leader_id, title, created_at::text AS created_at, archived_at::text AS archived_at
        FROM leader_tasks
        WHERE leader_id = ${leaderId} AND archived_at IS NULL
        ORDER BY id ASC
      `
  return rows as LeaderTask[]
}

export async function getTaskChecksForDay(
  creatorId: number,
  day: string,
): Promise<Set<number>> {
  await ensureTaskTables()
  const rows = (await sql`
    SELECT task_id FROM reposter_task_checks
    WHERE creator_id = ${creatorId} AND day = ${day}::date
  `) as { task_id: number }[]
  return new Set(rows.map((r) => r.task_id))
}

/** Last `days` calendar days of how many active tasks this reposter ticked. */
export async function getTaskCalendar(
  creatorId: number,
  leaderId: number,
  today: string,
  days = 28,
): Promise<TaskDaySummary[]> {
  await ensureTaskTables()
  const tasks = (await sql`
    SELECT id, created_at::date::text AS created_on
    FROM leader_tasks
    WHERE leader_id = ${leaderId} AND archived_at IS NULL
  `) as { id: number; created_on: string }[]
  const checks = (await sql`
    SELECT task_id, day::text AS day
    FROM reposter_task_checks
    WHERE creator_id = ${creatorId}
      AND day BETWEEN (${today}::date - ${days - 1}) AND ${today}::date
  `) as { task_id: number; day: string }[]
  const out: TaskDaySummary[] = []
  const start = new Date(`${today}T00:00:00Z`)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() - i)
    const day = d.toISOString().slice(0, 10)
    const total = tasks.filter((t) => t.created_on <= day).length
    const done = checks.filter((c) => c.day === day && tasks.some((t) => t.id === c.task_id)).length
    out.push({ day, done, total })
  }
  return out
}
