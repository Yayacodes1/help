'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getLeaderForCreator } from '@/lib/leaders'
import { getCreatorById, getCreatorByName } from '@/lib/queries'
import { REPOSTER_ACTIVITY_KINDS } from '@/lib/activity-kinds'
import { ensureActivityTable } from '@/lib/activity'
import { ensureReposterCheckTables } from '@/lib/reposter-checks'
import { creatorIsPaused } from '@/lib/pause-person'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function saveReposterCheck(formData: FormData) {
  const username = (formData.get('username') ?? '').toString()
  const creatorId = Number(formData.get('creator_id'))
  const day = (formData.get('day') ?? '').toString()
  if (!Number.isFinite(creatorId) || creatorId <= 0 || !DATE_RE.test(day)) return

  const actor = await getCreatorByName(username)
  if (!actor || actor.role !== 'reposter' || (await creatorIsPaused(actor.id))) throw new Error('Unauthorized')
  const target = await getCreatorById(creatorId)
  if (!target || target.role !== 'creator' || (await creatorIsPaused(target.id))) return

  const [actorLink, targetLink] = await Promise.all([
    getLeaderForCreator(actor.id),
    getLeaderForCreator(target.id),
  ])
  if (!actorLink || !targetLink || actorLink.leaderId !== targetLink.leaderId) {
    throw new Error('Unauthorized')
  }

  const checked = (formData.get('checked') ?? '').toString() === '1'
  await ensureReposterCheckTables()
  await ensureActivityTable()
  if (!checked) {
    await sql`
      DELETE FROM reposter_checks
      WHERE reposter_id = ${actor.id} AND creator_id = ${creatorId} AND day = ${day}::date
    `
    for (const kind of REPOSTER_ACTIVITY_KINDS) {
      await sql`
        DELETE FROM activity_marks
        WHERE creator_id = ${creatorId} AND day = ${day}::date AND kind = ${kind}
      `
    }
  } else {
    await sql`
      INSERT INTO reposter_checks (reposter_id, creator_id, day)
      VALUES (${actor.id}, ${creatorId}, ${day}::date)
      ON CONFLICT (reposter_id, creator_id, day)
      DO UPDATE SET checked_at = NOW()
    `
    for (const kind of REPOSTER_ACTIVITY_KINDS) {
      await sql`
        INSERT INTO activity_marks (creator_id, day, kind, marked_by)
        VALUES (${creatorId}, ${day}::date, ${kind}, ${actor.name})
        ON CONFLICT (creator_id, day, kind)
        DO UPDATE SET marked_by = EXCLUDED.marked_by, marked_at = NOW()
      `
    }
  }

  revalidatePath('/submit')
  revalidatePath('/leader')
}
