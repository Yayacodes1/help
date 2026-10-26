import 'server-only'
import { sql } from '@/lib/db'

/** Stop a creator or reposter from daily lists. Past videos stay in analytics. */
export async function pausePerson(id: number, today: string): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return
  await sql`
    UPDATE creators SET paused_at = ${today}::date
    WHERE id = ${id} AND paused_at IS NULL
  `
}
