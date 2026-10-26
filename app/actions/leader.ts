'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createLeaderSession, destroyLeaderSession, getLeaderSession } from '@/lib/leader-auth'
import { addDays } from '@/lib/campaign'
import { creatorBelongsToLeader, findLeaderByName } from '@/lib/leaders'
import { createBreakRequest, parseBreakKind } from '@/lib/break-requests'
import { verifyPassword } from '@/lib/passwords'
import { sql } from '@/lib/db'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function loginLeader(_prev: unknown, formData: FormData) {
  const name = (formData.get('name') ?? '').toString()
  const password = (formData.get('password') ?? '').toString()
  const leader = await findLeaderByName(name)
  if (!leader || !verifyPassword(password, leader.password_hash)) {
    return { ok: false as const, message: 'Incorrect name or password.' }
  }
  await createLeaderSession(leader)
  redirect('/leader')
}

export async function logoutLeader() {
  await destroyLeaderSession()
  redirect('/login')
}

export async function saveLeaderCheck(formData: FormData) {
  const session = await getLeaderSession()
  if (!session) throw new Error('Unauthorized')
  const creatorId = Number(formData.get('creator_id'))
  const day = (formData.get('day') ?? '').toString()
  if (!Number.isFinite(creatorId) || !DATE_RE.test(day)) return
  if (!(await creatorBelongsToLeader(creatorId, session.id))) return

  const checked = (formData.get('checked') ?? '').toString() === '1'
  const keepNote = (formData.get('keep_note') ?? '').toString() === '1'
  const noteRaw = (formData.get('note') ?? '').toString().trim()
  const note = noteRaw ? noteRaw.slice(0, 500) : null

  if (!checked) {
    await sql`
      DELETE FROM leader_checks
      WHERE leader_id = ${session.id} AND creator_id = ${creatorId} AND day = ${day}::date
    `
  } else if (keepNote) {
    await sql`
      INSERT INTO leader_checks (leader_id, creator_id, day, note)
      VALUES (${session.id}, ${creatorId}, ${day}::date, NULL)
      ON CONFLICT (leader_id, creator_id, day)
      DO UPDATE SET checked_at = NOW()
    `
  } else {
    await sql`
      INSERT INTO leader_checks (leader_id, creator_id, day, note)
      VALUES (${session.id}, ${creatorId}, ${day}::date, ${note})
      ON CONFLICT (leader_id, creator_id, day)
      DO UPDATE SET note = EXCLUDED.note, checked_at = NOW()
    `
  }

  revalidatePath('/leader')
  revalidatePath(`/leader/creators/${creatorId}`)
  revalidatePath('/admin')
}

export async function requestTeamBreak(formData: FormData) {
  const session = await getLeaderSession()
  if (!session) throw new Error('Unauthorized')
  const creatorId = Number(formData.get('creator_id'))
  const kind = parseBreakKind(formData.get('kind'))
  const start = (formData.get('start_date') ?? '').toString()
  const daysRaw = Number(formData.get('days'))
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.min(90, Math.floor(daysRaw)) : 0
  const reasonRaw = (formData.get('reason') ?? '').toString().trim()
  if (!Number.isFinite(creatorId) || creatorId <= 0) {
    return { ok: false as const, error: 'Pick a person.' }
  }
  if (kind === 'break' && (!DATE_RE.test(start) || days < 1)) {
    return { ok: false as const, error: 'Pick a start date and how many days.' }
  }
  if (!(await creatorBelongsToLeader(creatorId, session.id))) {
    return { ok: false as const, error: 'That person is not on your team.' }
  }
  const { getServerToday } = await import('@/lib/queries')
  const today = await getServerToday()
  const from = kind === 'pause' ? today : start
  const span = kind === 'pause' ? 1 : days
  const end = addDays(from, span - 1)
  await createBreakRequest({
    leaderId: session.id,
    creatorId,
    kind,
    start: from,
    end,
    days: span,
    reason: reasonRaw ? reasonRaw.slice(0, 500) : null,
  })
  revalidatePath('/leader')
  revalidatePath(`/leader/creators/${creatorId}`)
  revalidatePath('/admin')
  return { ok: true as const }
}

export async function applyTeamBreakRequest(id: number) {
  const session = await getLeaderSession()
  if (!session) throw new Error('Unauthorized')
  const { claimBreakRequestToApply, releaseBreakRequestClaim } = await import('@/lib/break-requests')
  const request = await claimBreakRequestToApply(id, session.id)
  if (!request) {
    return { ok: false as const, error: 'Ahmed has to approve this first, or it was already given.' }
  }
  try {
    const { getServerToday } = await import('@/lib/queries')
    const today = await getServerToday()
    if (request.kind === 'pause') {
      const { pausePerson } = await import('@/lib/pause-person')
      await pausePerson(request.creator_id, today)
    } else {
      const { applyScheduleBreak } = await import('@/lib/schedule-breaks')
      await applyScheduleBreak({
        creatorId: request.creator_id,
        start: request.start_date,
        end: request.end_date,
        reason: request.reason ?? `Break given by ${session.name}`,
      })
    }
  } catch (error) {
    await releaseBreakRequestClaim(id)
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Could not give this yet. Try again.',
    }
  }
  revalidatePath('/leader')
  revalidatePath(`/leader/creators/${request.creator_id}`)
  revalidatePath('/admin')
  revalidatePath('/submit')
  revalidatePath(`/admin/creators/${request.creator_id}`)
  return { ok: true as const }
}
