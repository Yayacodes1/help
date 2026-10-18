'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getLeaderForCreator } from '@/lib/leaders'
import { getCreatorById, getCreatorByName } from '@/lib/queries'
import { ensureReposterCheckTables } from '@/lib/reposter-checks'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function saveReposterCheck(formData: FormData) {
  const username = (formData.get('username') ?? '').toString()
  const creatorId = Number(formData.get('creator_id'))
  const day = (formData.get('day') ?? '').toString()
  if (!Number.isFinite(creatorId) || creatorId <= 0 || !DATE_RE.test(day)) return

  const actor = await getCreatorByName(username)
  if (!actor || actor.role !== 'reposter') throw new Error('Unauthorized')
  const target = await getCreatorById(creatorId)
  if (!target || target.role !== 'creator') return

  const [actorLink, targetLink] = await Promise.all([
    getLeaderForCreator(actor.id),
    getLeaderForCreator(target.id),
  ])
  if (!actorLink || !targetLink || actorLink.leaderId !== targetLink.leaderId) {
    throw new Error('Unauthorized')
  }

  const checked = (formData.get('checked') ?? '').toString() === '1'
  await ensureReposterCheckTables()
  if (!checked) {
    await sql`
      DELETE FROM reposter_checks
      WHERE reposter_id = ${actor.id} AND creator_id = ${creatorId} AND day = ${day}::date
    `
  } else {
    await sql`
      INSERT INTO reposter_checks (reposter_id, creator_id, day)
      VALUES (${actor.id}, ${creatorId}, ${day}::date)
      ON CONFLICT (reposter_id, creator_id, day)
      DO UPDATE SET checked_at = NOW()
    `
  }

  revalidatePath('/submit')
  revalidatePath('/leader')
}
