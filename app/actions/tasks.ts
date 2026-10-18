'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderForCreator } from '@/lib/leaders'
import { ensureTaskTables } from '@/lib/tasks'
import { getCreatorByName } from '@/lib/queries'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function requireLeader() {
  const session = await getLeaderSession()
  if (!session) throw new Error('Unauthorized')
  return session
}

export async function createLeaderTask(formData: FormData) {
  const session = await requireLeader()
  const title = (formData.get('title') ?? '').toString().trim().slice(0, 200)
  if (!title) return
  const pin = (formData.get('pin') ?? '').toString() === '1'
  await ensureTaskTables()
  if (pin) {
    await sql`
      INSERT INTO leader_tasks (leader_id, title, pinned_at)
      VALUES (${session.id}, ${title}, NOW())
    `
  } else {
    await sql`
      INSERT INTO leader_tasks (leader_id, title)
      VALUES (${session.id}, ${title})
    `
  }
  revalidatePath('/leader')
  revalidatePath('/submit')
  revalidatePath('/admin')
}

export async function updateLeaderTask(formData: FormData) {
  const session = await requireLeader()
  const id = Number(formData.get('task_id'))
  const title = (formData.get('title') ?? '').toString().trim().slice(0, 200)
  if (!Number.isFinite(id) || id <= 0 || !title) return
  await ensureTaskTables()
  await sql`
    UPDATE leader_tasks
    SET title = ${title}
    WHERE id = ${id} AND leader_id = ${session.id} AND archived_at IS NULL
  `
  revalidatePath('/leader')
  revalidatePath('/submit')
  revalidatePath('/admin')
}

export async function pinLeaderTask(formData: FormData) {
  const session = await requireLeader()
  const id = Number(formData.get('task_id'))
  if (!Number.isFinite(id) || id <= 0) return
  await ensureTaskTables()
  const unpin = (formData.get('unpin') ?? '').toString() === '1'
  if (unpin) {
    await sql`
      UPDATE leader_tasks
      SET pinned_at = NULL, archived_at = NOW()
      WHERE id = ${id} AND leader_id = ${session.id} AND archived_at IS NULL
    `
  } else {
    await sql`
      UPDATE leader_tasks
      SET pinned_at = NOW()
      WHERE id = ${id} AND leader_id = ${session.id} AND archived_at IS NULL
    `
  }
  revalidatePath('/leader')
  revalidatePath('/submit')
  revalidatePath('/admin')
}

export async function archiveLeaderTask(formData: FormData) {
  const session = await requireLeader()
  const id = Number(formData.get('task_id'))
  if (!Number.isFinite(id) || id <= 0) return
  await ensureTaskTables()
  await sql`
    UPDATE leader_tasks
    SET archived_at = NOW()
    WHERE id = ${id} AND leader_id = ${session.id} AND archived_at IS NULL
  `
  revalidatePath('/leader')
  revalidatePath('/submit')
  revalidatePath('/admin')
}

export async function toggleReposterTask(formData: FormData) {
  const username = (formData.get('username') ?? '').toString()
  const taskId = Number(formData.get('task_id'))
  const day = (formData.get('day') ?? '').toString()
  const on = (formData.get('on') ?? '').toString() === '1'
  if (!Number.isFinite(taskId) || taskId <= 0 || !DATE_RE.test(day)) return

  const creator = await getCreatorByName(username)
  if (!creator || creator.role !== 'reposter') throw new Error('Unauthorized')
  const link = await getLeaderForCreator(creator.id)
  if (!link) throw new Error('Unauthorized')

  await ensureTaskTables()
  const owned = (await sql`
    SELECT id FROM leader_tasks
    WHERE id = ${taskId} AND leader_id = ${link.leaderId} AND archived_at IS NULL
    LIMIT 1
  `) as { id: number }[]
  if (!owned[0]) return

  if (on) {
    await sql`
      INSERT INTO reposter_task_checks (task_id, creator_id, day)
      VALUES (${taskId}, ${creator.id}, ${day}::date)
      ON CONFLICT (task_id, creator_id, day) DO NOTHING
    `
  } else {
    await sql`
      DELETE FROM reposter_task_checks
      WHERE task_id = ${taskId} AND creator_id = ${creator.id} AND day = ${day}::date
    `
  }
  revalidatePath('/submit')
  revalidatePath('/leader')
  revalidatePath('/admin')
}
