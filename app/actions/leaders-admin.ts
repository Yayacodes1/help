'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'
import { ensureLeaderTables } from '@/lib/leaders'
import { hashPassword } from '@/lib/passwords'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

function parseIds(formData: FormData): number[] {
  return [
    ...new Set(
      formData
        .getAll('creator_ids')
        .map((value) => Number(value))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n)),
    ),
  ]
}

function friendly(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : ''
  if (msg.includes('leaders_name_lower')) return 'A leader with that name already exists.'
  if (msg.includes('leaders_reposter')) return 'That reposter account is already linked to another leader.'
  return null
}

async function assignCreators(leaderId: number, creatorIds: number[]) {
  await sql`
    UPDATE creators
    SET leader_id = NULL
    WHERE leader_id = ${leaderId} AND role = 'creator'
  `
  if (creatorIds.length === 0) return
  await sql`
    UPDATE creators
    SET leader_id = ${leaderId}
    WHERE role = 'creator' AND id = ANY(${creatorIds}::int[])
  `
}

function refresh() {
  revalidatePath('/admin')
  revalidatePath('/leader')
}

export async function createLeader(_prev: unknown, formData: FormData) {
  await requireAdmin()
  await ensureLeaderTables()
  const name = (formData.get('name') ?? '').toString().trim().slice(0, 80)
  const password = (formData.get('password') ?? '').toString()
  if (!name) return { ok: false as const, message: 'Enter a name.' }
  if (password.length < 4) return { ok: false as const, message: 'Password needs at least 4 characters.' }
  const reposterId = parseId(formData.get('reposter_id'))
  try {
    const rows = (await sql`
      INSERT INTO leaders (name, password_hash, reposter_id)
      VALUES (${name}, ${hashPassword(password)}, ${reposterId})
      RETURNING id
    `) as { id: number }[]
    const id = rows[0]?.id
    if (id) await assignCreators(id, parseIds(formData))
  } catch (error) {
    const message = friendly(error)
    if (message) return { ok: false as const, message }
    throw error
  }
  refresh()
  return { ok: true as const, message: '' }
}

export async function updateLeader(_prev: unknown, formData: FormData) {
  await requireAdmin()
  await ensureLeaderTables()
  const id = parseId(formData.get('id'))
  if (!id) return { ok: false as const, message: 'Missing leader.' }
  const name = (formData.get('name') ?? '').toString().trim().slice(0, 80)
  if (!name) return { ok: false as const, message: 'Enter a name.' }
  const password = (formData.get('password') ?? '').toString()
  const reposterId = parseId(formData.get('reposter_id'))
  try {
    if (password) {
      if (password.length < 4) return { ok: false as const, message: 'Password needs at least 4 characters.' }
      await sql`
        UPDATE leaders
        SET name = ${name}, password_hash = ${hashPassword(password)}, reposter_id = ${reposterId}
        WHERE id = ${id}
      `
    } else {
      await sql`
        UPDATE leaders
        SET name = ${name}, reposter_id = ${reposterId}
        WHERE id = ${id}
      `
    }
    await assignCreators(id, parseIds(formData))
  } catch (error) {
    const message = friendly(error)
    if (message) return { ok: false as const, message }
    throw error
  }
  refresh()
  return { ok: true as const, message: '' }
}

export async function deleteLeader(formData: FormData) {
  await requireAdmin()
  await ensureLeaderTables()
  const id = parseId(formData.get('id'))
  if (!id) return
  await sql`UPDATE creators SET leader_id = NULL WHERE leader_id = ${id}`
  await sql`DELETE FROM leaders WHERE id = ${id}`
  refresh()
}
