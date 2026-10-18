'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getLeaderSession } from '@/lib/leader-auth'
import { creatorBelongsToLeader, getLeaderForCreator } from '@/lib/leaders'
import { ensureActivityTable } from '@/lib/activity'
import { isActivityKind } from '@/lib/activity-kinds'
import { getCreatorByName } from '@/lib/queries'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Admins can tick anyone; a leader only people on their team; a group reposter can tick teammates. */
async function markerFor(
  creatorId: number,
  actorUsername?: string | null,
): Promise<string | null> {
  const admin = await getAdminSession()
  if (admin) return admin.name
  const leader = await getLeaderSession()
  if (leader && (await creatorBelongsToLeader(creatorId, leader.id))) return leader.name
  const handle = (actorUsername ?? '').trim()
  if (!handle) return null
  const actor = await getCreatorByName(handle)
  if (!actor || actor.role !== 'reposter') return null
  if (actor.id === creatorId) return actor.name
  const [actorLink, targetLink] = await Promise.all([
    getLeaderForCreator(actor.id),
    getLeaderForCreator(creatorId),
  ])
  if (actorLink && targetLink && actorLink.leaderId === targetLink.leaderId) return actor.name
  return null
}

export async function setActivity(input: {
  creatorId: number
  day: string
  kind: string
  on: boolean
  actorUsername?: string
}) {
  const creatorId = Math.floor(Number(input.creatorId))
  if (!Number.isFinite(creatorId) || creatorId <= 0) return { ok: false as const }
  if (!DATE_RE.test(input.day) || !isActivityKind(input.kind)) return { ok: false as const }
  const markedBy = await markerFor(creatorId, input.actorUsername)
  if (!markedBy) throw new Error('Unauthorized')

  await ensureActivityTable()
  if (input.on) {
    await sql`
      INSERT INTO activity_marks (creator_id, day, kind, marked_by)
      VALUES (${creatorId}, ${input.day}::date, ${input.kind}, ${markedBy})
      ON CONFLICT (creator_id, day, kind)
      DO UPDATE SET marked_by = EXCLUDED.marked_by, marked_at = NOW()
    `
  } else {
    await sql`
      DELETE FROM activity_marks
      WHERE creator_id = ${creatorId} AND day = ${input.day}::date AND kind = ${input.kind}
    `
  }

  revalidatePath('/admin')
  revalidatePath('/leader')
  revalidatePath('/submit')
  return { ok: true as const }
}
