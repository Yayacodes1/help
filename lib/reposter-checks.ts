import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'

export async function ensureReposterCheckTables() {
  return ensureOnce('reposter-checks', runEnsureReposterCheckTables)
}

async function runEnsureReposterCheckTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS reposter_checks (
      reposter_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (reposter_id, creator_id, day)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS reposter_checks_day_idx ON reposter_checks (day)`
  await sql`CREATE INDEX IF NOT EXISTS reposter_checks_reposter_day_idx ON reposter_checks (reposter_id, day)`
}

export async function getReposterChecksForDay(reposterId: number, day: string): Promise<Set<number>> {
  await ensureReposterCheckTables()
  const rows = (await sql`
    SELECT creator_id FROM reposter_checks
    WHERE reposter_id = ${reposterId} AND day = ${day}::date
  `) as { creator_id: number }[]
  return new Set(rows.map((r) => r.creator_id))
}

/** reposter id → creator ids they ticked that day */
export async function getReposterChecksForTeam(
  reposterIds: number[],
  day: string,
): Promise<Map<number, Set<number>>> {
  await ensureReposterCheckTables()
  const out = new Map<number, Set<number>>()
  for (const id of reposterIds) out.set(id, new Set())
  if (reposterIds.length === 0) return out
  const rows = (await sql`
    SELECT reposter_id, creator_id FROM reposter_checks
    WHERE day = ${day}::date AND reposter_id = ANY(${reposterIds}::int[])
  `) as { reposter_id: number; creator_id: number }[]
  for (const row of rows) out.get(row.reposter_id)?.add(row.creator_id)
  return out
}
