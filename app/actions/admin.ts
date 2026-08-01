'use server'

import { randomBytes } from 'crypto'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import {
  createAdminSession,
  destroyAdminSession,
  isAdmin,
  verifyPassword,
} from '@/lib/admin-auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

// --- Auth ---

export async function login(_prev: unknown, formData: FormData) {
  const password = (formData.get('password') ?? '').toString()
  if (!verifyPassword(password)) {
    return { ok: false, message: 'Incorrect password.' }
  }
  await createAdminSession()
  redirect('/admin')
}

export async function logout() {
  await destroyAdminSession()
  redirect('/login')
}

// --- Projects ---

export async function createProject(formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  if (!name) return
  await sql`INSERT INTO projects (name) VALUES (${name})`
  revalidatePath('/admin')
}

export async function deleteProject(id: number) {
  await requireAdmin()
  await sql`UPDATE creators SET project_id = NULL WHERE project_id = ${id}`
  await sql`UPDATE submissions SET project_id = NULL WHERE project_id = ${id}`
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath('/admin')
}

// --- Creators ---

function parseGoal(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function parseOptionalDate(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function parsePayEveryDays(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  if (!Number.isFinite(n) || n < 1) return 14
  return Math.min(365, Math.floor(n))
}

function parseNotes(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  return raw ? raw.slice(0, 2000) : null
}

export async function createCreator(formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const projectIdRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectIdRaw ? Number(projectIdRaw) : null
  if (!name) return
  const goalInstagram = parseGoal(formData.get('goal_instagram'))
  const goalTiktok = parseGoal(formData.get('goal_tiktok'))
  const lastPaidAt = parseOptionalDate(formData.get('last_paid_at'))
  const payEveryDays = parsePayEveryDays(formData.get('pay_every_days'))
  const notes = parseNotes(formData.get('notes'))
  const token = randomBytes(12).toString('hex')
  const rows = (await sql`
    INSERT INTO creators (
      name, token, project_id, goal_instagram, goal_tiktok,
      last_paid_at, pay_every_days, notes
    )
    VALUES (
      ${name}, ${token}, ${projectId}, ${goalInstagram}, ${goalTiktok},
      ${lastPaidAt}, ${payEveryDays}, ${notes}
    )
    RETURNING id
  `) as { id: number }[]

  const creatorId = rows[0]?.id
  const contractName = (formData.get('contract_name') ?? '').toString().trim() || 'Initial contract'
  const contractStart = parseOptionalDate(formData.get('contract_start'))
  if (creatorId && contractStart) {
    await sql`
      INSERT INTO contracts (creator_id, name, start_date, end_date)
      VALUES (${creatorId}, ${contractName}, ${contractStart}, NULL)
    `
  }

  revalidatePath('/admin')
}

export async function updateCreator(id: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const projectIdRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectIdRaw ? Number(projectIdRaw) : null
  if (!name) return
  const goalInstagram = parseGoal(formData.get('goal_instagram'))
  const goalTiktok = parseGoal(formData.get('goal_tiktok'))
  const lastPaidAt = parseOptionalDate(formData.get('last_paid_at'))
  const payEveryDays = parsePayEveryDays(formData.get('pay_every_days'))
  const notes = parseNotes(formData.get('notes'))
  await sql`
    UPDATE creators
    SET name = ${name}, project_id = ${projectId},
        goal_instagram = ${goalInstagram}, goal_tiktok = ${goalTiktok},
        last_paid_at = ${lastPaidAt}, pay_every_days = ${payEveryDays},
        notes = ${notes}
    WHERE id = ${id}
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${id}`)
}

export async function markCreatorPaid(id: number, formData: FormData) {
  await requireAdmin()
  const paidOn = parseOptionalDate(formData.get('paid_on'))
  const date = paidOn ?? new Date().toISOString().slice(0, 10)
  await sql`UPDATE creators SET last_paid_at = ${date} WHERE id = ${id}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${id}`)
}

export async function deleteCreator(id: number) {
  await requireAdmin()
  await sql`DELETE FROM contracts WHERE creator_id = ${id}`
  await sql`DELETE FROM submissions WHERE creator_id = ${id}`
  await sql`DELETE FROM creators WHERE id = ${id}`
  revalidatePath('/admin')
}

// --- Contracts ---

export async function createContract(creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  const end = parseOptionalDate(formData.get('end_date'))
  if (!name || !start) return
  if (end && end < start) return

  await sql`
    INSERT INTO contracts (creator_id, name, start_date, end_date)
    VALUES (${creatorId}, ${name}, ${start}, ${end})
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
}

/** End the open contract the day before, then open a new named period. */
export async function startNewContract(creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  if (!name || !start) return

  const open = (await sql`
    SELECT id, start_date::text AS start_date
    FROM contracts
    WHERE creator_id = ${creatorId} AND end_date IS NULL
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { id: number; start_date: string }[]

  if (open[0]) {
    const prevEnd =
      start <= open[0].start_date
        ? open[0].start_date
        : addDays(start, -1)
    await sql`UPDATE contracts SET end_date = ${prevEnd} WHERE id = ${open[0].id}`
  }

  await sql`
    INSERT INTO contracts (creator_id, name, start_date, end_date)
    VALUES (${creatorId}, ${name}, ${start}, NULL)
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
}

export async function updateContract(id: number, creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  const end = parseOptionalDate(formData.get('end_date'))
  if (!name || !start) return
  if (end && end < start) return

  await sql`
    UPDATE contracts
    SET name = ${name}, start_date = ${start}, end_date = ${end}
    WHERE id = ${id} AND creator_id = ${creatorId}
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
}

export async function deleteContract(id: number, creatorId: number) {
  await requireAdmin()
  await sql`DELETE FROM contracts WHERE id = ${id} AND creator_id = ${creatorId}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
}

// --- Submissions ---

export async function updateViews(id: number, views: number) {
  await requireAdmin()
  const safe = Number.isFinite(views) && views >= 0 ? Math.floor(views) : 0
  await sql`UPDATE submissions SET views = ${safe} WHERE id = ${id}`
  revalidatePath('/admin')
}

export async function deleteSubmission(id: number) {
  await requireAdmin()
  await sql`DELETE FROM submissions WHERE id = ${id}`
  revalidatePath('/admin')
}
