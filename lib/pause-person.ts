import 'server-only'
import { sql } from '@/lib/db'

/** Stop a creator or reposter. They stay on the pause list until resumed. */
export async function pausePerson(id: number, today: string): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return
  await sql`
    UPDATE creators SET paused_at = ${today}::date
    WHERE id = ${id} AND paused_at IS NULL
  `
}

export const PAUSED_ACCOUNT_MESSAGE =
  'هذا الحساب موقوف. يرجع فقط لما الإدارة تستأنفه. This account is paused until an admin resumes it.'

/** True while the person is paused. They cannot use the site or the bots. */
export async function creatorIsPaused(id: number): Promise<boolean> {
  if (!Number.isFinite(id) || id <= 0) return false
  const rows = (await sql`
    SELECT paused_at FROM creators WHERE id = ${id} LIMIT 1
  `) as { paused_at: string | null }[]
  return rows[0]?.paused_at != null
}

/** A leader's own posting account is paused, so that login stays closed too. */
export async function leaderOwnAccountPaused(leaderId: number): Promise<boolean> {
  if (!Number.isFinite(leaderId) || leaderId <= 0) return false
  const rows = (await sql`
    SELECT reposter_id FROM leaders WHERE id = ${leaderId} LIMIT 1
  `) as { reposter_id: number | null }[]
  const reposterId = rows[0]?.reposter_id
  if (!reposterId) return false
  return creatorIsPaused(reposterId)
}
