import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'

export async function ensureAdminTalkMarkTables() {
  return ensureOnce('admin-talk-marks', runEnsureAdminTalkMarkTables)
}

async function runEnsureAdminTalkMarkTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_talk_marks (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (creator_id, day)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS admin_talk_marks_day_idx ON admin_talk_marks (day)`
}

/** Creator ids marked “talk to them today” for the given day. */
export async function getAdminTalkMarksForDay(day: string): Promise<Set<number>> {
  await ensureAdminTalkMarkTables()
  const rows = (await sql`
    SELECT creator_id FROM admin_talk_marks
    WHERE day = ${day}::date
  `) as { creator_id: number }[]
  return new Set(rows.map((r) => Number(r.creator_id)))
}

export async function setAdminTalkMark(
  creatorId: number,
  day: string,
  talk: boolean,
): Promise<void> {
  await ensureAdminTalkMarkTables()
  if (!talk) {
    await sql`
      DELETE FROM admin_talk_marks
      WHERE creator_id = ${creatorId} AND day = ${day}::date
    `
    return
  }
  await sql`
    INSERT INTO admin_talk_marks (creator_id, day)
    VALUES (${creatorId}, ${day}::date)
    ON CONFLICT (creator_id, day)
    DO UPDATE SET marked_at = NOW()
  `
}
