import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import {
  emptyActivityCounts,
  isActivityKind,
  type ActivityCounts,
  type ActivityKind,
} from '@/lib/activity-kinds'

export async function ensureActivityTable() {
  return ensureOnce('activity', runEnsureActivityTable)
}

async function runEnsureActivityTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS activity_marks (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      kind TEXT NOT NULL,
      marked_by TEXT,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (creator_id, day, kind)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS activity_marks_day_idx ON activity_marks (day)`
}

/** creator id → kinds ticked on that day. */
export async function getActivityForDay(day: string, ids?: number[]): Promise<Record<number, ActivityKind[]>> {
  await ensureActivityTable()
  if (ids && ids.length === 0) return {}
  const rows = (ids
    ? await sql`
        SELECT creator_id, kind FROM activity_marks
        WHERE day = ${day}::date AND creator_id = ANY(${ids}::int[])
      `
    : await sql`
        SELECT creator_id, kind FROM activity_marks
        WHERE day = ${day}::date
      `) as { creator_id: number; kind: string }[]
  const out: Record<number, ActivityKind[]> = {}
  for (const row of rows) {
    if (!isActivityKind(row.kind)) continue
    ;(out[row.creator_id] ??= []).push(row.kind)
  }
  return out
}

export type ActivityDay = { day: string; kinds: ActivityKind[] }

/** Per person: totals and the days with at least one tick, newest first. */
export async function getActivityRange(
  ids: number[],
  from: string,
  to: string,
): Promise<Map<number, { counts: ActivityCounts; days: ActivityDay[] }>> {
  await ensureActivityTable()
  const out = new Map<number, { counts: ActivityCounts; days: ActivityDay[] }>()
  if (ids.length === 0) return out
  const rows = (await sql`
    SELECT creator_id, day::text AS day, kind
    FROM activity_marks
    WHERE creator_id = ANY(${ids}::int[]) AND day BETWEEN ${from}::date AND ${to}::date
    ORDER BY day DESC
  `) as { creator_id: number; day: string; kind: string }[]
  for (const row of rows) {
    if (!isActivityKind(row.kind)) continue
    const entry = out.get(row.creator_id) ?? { counts: emptyActivityCounts(), days: [] }
    entry.counts[row.kind]++
    const last = entry.days[entry.days.length - 1]
    if (last?.day === row.day) last.kinds.push(row.kind)
    else entry.days.push({ day: row.day, kinds: [row.kind] })
    out.set(row.creator_id, entry)
  }
  return out
}
