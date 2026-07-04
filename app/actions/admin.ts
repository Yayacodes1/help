'use server'

import { randomBytes } from 'crypto'
import { sql } from '@/lib/db'
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
  redirect('/admin/login')
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

export async function createCreator(formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const projectIdRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectIdRaw ? Number(projectIdRaw) : null
  if (!name) return
  const goalInstagram = parseGoal(formData.get('goal_instagram'))
  const goalTiktok = parseGoal(formData.get('goal_tiktok'))
  const token = randomBytes(12).toString('hex')
  await sql`
    INSERT INTO creators (name, token, project_id, goal_instagram, goal_tiktok)
    VALUES (${name}, ${token}, ${projectId}, ${goalInstagram}, ${goalTiktok})
  `
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
  await sql`
    UPDATE creators
    SET name = ${name}, project_id = ${projectId},
        goal_instagram = ${goalInstagram}, goal_tiktok = ${goalTiktok}
    WHERE id = ${id}
  `
  revalidatePath('/admin')
}

export async function deleteCreator(id: number) {
  await requireAdmin()
  await sql`DELETE FROM submissions WHERE creator_id = ${id}`
  await sql`DELETE FROM creators WHERE id = ${id}`
  revalidatePath('/admin')
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
