'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { hashPassword } from '@/lib/passwords'
import { normalizePlatforms } from '@/lib/platforms-mode'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  ensureOutreachTables,
  getOutreachLead,
  getOutreachTemplate,
  usernameTakenByCreator,
} from '@/lib/outreach'
import {
  destroyOutreachSession,
  loginOutreachMember,
  resolveOutreachActor,
  type OutreachActor,
} from '@/lib/outreach-auth'
import { readOutreachScreenshots } from '@/lib/outreach-vision'
import { normalizeOutreachPhone } from '@/lib/saudi-phone'

export type OutreachActionState = { ok: boolean; message: string }

async function requireActor(creatorHandle?: string): Promise<OutreachActor> {
  const actor = await resolveOutreachActor(creatorHandle)
  if (!actor) throw new Error('Unauthorized')
  return actor
}

async function requireUpper(creatorHandle?: string): Promise<OutreachActor> {
  const actor = await requireActor(creatorHandle)
  if (actor.role !== 'upper') throw new Error('Unauthorized')
  return actor
}

async function requireAhmed() {
  const admin = await getAdminSession()
  if (admin?.id !== 'ahmed') throw new Error('Unauthorized')
  return admin
}

function refresh() {
  revalidatePath('/outreach')
  revalidatePath('/admin')
  revalidatePath('/submit')
  revalidatePath('/leader')
}

export async function loginOutreach(_prev: unknown, formData: FormData) {
  const name = (formData.get('name') ?? '').toString()
  const password = (formData.get('password') ?? '').toString()
  const member = await loginOutreachMember(name, password)
  if (!member) return { ok: false as const, message: 'Incorrect name or password.' }
  redirect('/outreach')
}

export async function logoutOutreach() {
  await destroyOutreachSession()
  redirect('/login')
}

export async function addOutreachMember(_prev: unknown, formData: FormData): Promise<OutreachActionState> {
  await requireAhmed()
  await ensureOutreachTables()
  const role = (formData.get('role') ?? '').toString() === 'upper' ? 'upper' : 'outreach'
  const mode = (formData.get('mode') ?? '').toString()

  try {
    if (mode === 'leader') {
      if (role !== 'upper') return { ok: false, message: 'Leaders are added as upper management.' }
      const leaderId = Number(formData.get('leader_id'))
      if (!Number.isFinite(leaderId) || leaderId <= 0) return { ok: false, message: 'Choose a leader.' }
      const rows = (await sql`SELECT id, name FROM leaders WHERE id = ${leaderId} LIMIT 1`) as {
        id: number
        name: string
      }[]
      if (!rows[0]) return { ok: false, message: 'That leader was not found.' }
      await sql`
        INSERT INTO outreach_members (name, role, leader_id)
        VALUES (${rows[0].name}, 'upper', ${rows[0].id})
      `
    } else if (mode === 'reposter') {
      const creatorId = Number(formData.get('creator_id'))
      if (!Number.isFinite(creatorId) || creatorId <= 0) return { ok: false, message: 'Choose a reposter.' }
      const rows = (await sql`
        SELECT id, name FROM creators
        WHERE id = ${creatorId} AND role = 'reposter' AND paused_at IS NULL
        LIMIT 1
      `) as { id: number; name: string }[]
      if (!rows[0]) return { ok: false, message: 'That reposter was not found.' }
      await sql`
        INSERT INTO outreach_members (name, role, creator_id)
        VALUES (${rows[0].name}, ${role}, ${rows[0].id})
      `
    } else {
      const name = (formData.get('name') ?? '').toString().trim().slice(0, 80)
      const password = (formData.get('password') ?? '').toString()
      if (name.length < 2) return { ok: false, message: 'Add a name.' }
      if (password.length < 4) return { ok: false, message: 'Use a password of at least 4 characters.' }
      await sql`
        INSERT INTO outreach_members (name, role, password_hash)
        VALUES (${name}, ${role}, ${hashPassword(password)})
      `
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, message: 'That person is already added.' }
    }
    throw error
  }

  refresh()
  return { ok: true, message: 'Added.' }
}

export async function removeOutreachMember(formData: FormData) {
  await requireAhmed()
  await ensureOutreachTables()
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) return
  await sql`DELETE FROM outreach_members WHERE id = ${id}`
  refresh()
}

export async function addOutreachLead(
  _prev: OutreachActionState,
  formData: FormData,
): Promise<OutreachActionState> {
  const handle = (formData.get('creator_handle') ?? '').toString()
  const actor = await requireActor(handle)
  if (actor.role !== 'outreach' && actor.role !== 'upper') {
    return { ok: false, message: 'You cannot add accounts.' }
  }
  // Upper management negotiates. Adding is for outreachers. Ahmed asked outreachers to drop the pictures.
  if (actor.role !== 'outreach') {
    return { ok: false, message: 'Outreach people add the accounts.' }
  }

  const phone = (formData.get('phone') ?? '').toString()
  const accountImage = (formData.get('account_image') ?? '').toString()
  const chatImage = (formData.get('chat_image') ?? '').toString()
  const read = await readOutreachScreenshots({ accountImage, chatImage, phone })
  if (!read.ok) return { ok: false, message: read.error }

  const normalized = normalizeOutreachPhone(read.read.pastedPhone)
  if (!normalized.ok) return { ok: false, message: normalized.error }
  const usernameKey = read.read.username.toLowerCase()

  if (await usernameTakenByCreator(read.read.username)) {
    return { ok: false, message: `@${read.read.username} is already a creator.` }
  }

  const dupUser = (await sql`
    SELECT id FROM outreach_leads WHERE username_key = ${usernameKey} LIMIT 1
  `) as { id: number }[]
  if (dupUser.length > 0) {
    return { ok: false, message: `@${read.read.username} is already in the list.` }
  }
  const dupPhone = (await sql`
    SELECT id FROM outreach_leads WHERE phone_key = ${normalized.key} LIMIT 1
  `) as { id: number }[]
  if (dupPhone.length > 0) {
    return { ok: false, message: 'That phone number is already in the list.' }
  }

  try {
    await sql`
      INSERT INTO outreach_leads (
        username, username_key, phone, phone_key, followers, likes, platform,
        account_image, chat_image, status, added_by_key, added_by_name
      )
      VALUES (
        ${read.read.username},
        ${usernameKey},
        ${normalized.e164},
        ${normalized.key},
        ${read.read.followers},
        ${read.read.likes},
        ${read.read.platform},
        ${accountImage},
        ${chatImage},
        'open',
        ${actor.key},
        ${actor.name}
      )
    `
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('username') || msg.includes('phone') || msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, message: 'That username or phone number is already in the list.' }
    }
    throw error
  }

  refresh()
  return { ok: true, message: `Added @${read.read.username} · ${normalized.e164}` }
}

function blockedByOther(actor: OutreachActor, lead: { status: string; negotiatorKey: string | null }): boolean {
  return lead.status === 'negotiating' && lead.negotiatorKey != null && lead.negotiatorKey !== actor.key
}

export async function setOutreachStatus(formData: FormData) {
  const actor = await requireUpper((formData.get('creator_handle') ?? '').toString())
  const id = Number(formData.get('id'))
  const next = (formData.get('status') ?? '').toString()
  if (!Number.isFinite(id) || (next !== 'negotiating' && next !== 'done' && next !== 'passed')) return
  const lead = await getOutreachLead(id)
  if (!lead || lead.status === 'closed') return
  if (blockedByOther(actor, lead)) return
  if (next === 'negotiating' && lead.status !== 'open') return

  if (next === 'negotiating') {
    await sql`
      UPDATE outreach_leads
      SET status = 'negotiating',
          negotiator_key = ${actor.key},
          negotiator_name = ${actor.name},
          updated_at = NOW()
      WHERE id = ${id} AND status = 'open'
    `
  } else {
    await sql`
      UPDATE outreach_leads
      SET status = ${next},
          negotiator_key = COALESCE(negotiator_key, ${actor.key}),
          negotiator_name = COALESCE(negotiator_name, ${actor.name}),
          updated_at = NOW()
      WHERE id = ${id}
        AND status <> 'closed'
        AND (status <> 'negotiating' OR negotiator_key IS NULL OR negotiator_key = ${actor.key})
    `
  }
  refresh()
}

export async function saveOutreachTemplate(_prev: OutreachActionState, formData: FormData): Promise<OutreachActionState> {
  const actor = await requireUpper((formData.get('creator_handle') ?? '').toString())
  const body = (formData.get('body') ?? '').toString().trim().slice(0, 2000)
  await ensureOutreachTables()
  await sql`
    INSERT INTO outreach_templates (actor_key, body)
    VALUES (${actor.key}, ${body})
    ON CONFLICT (actor_key) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()
  `
  refresh()
  return { ok: true, message: 'Message saved.' }
}

export async function beginOutreachWhatsApp(leadId: number, creatorHandle: string) {
  const actor = await requireUpper(creatorHandle)
  const lead = await getOutreachLead(leadId)
  if (!lead) return { ok: false as const, message: 'That account is not in the list.' }
  if (blockedByOther(actor, lead)) {
    return { ok: false as const, message: `${lead.negotiatorName ?? 'Someone'} is already negotiating with them.` }
  }
  const body = (await getOutreachTemplate(actor.key)).trim()
  if (!body) return { ok: false as const, message: 'Write your WhatsApp message first.' }
  if (lead.status === 'open') {
    await sql`
      UPDATE outreach_leads
      SET status = 'negotiating',
          negotiator_key = ${actor.key},
          negotiator_name = ${actor.name},
          updated_at = NOW()
      WHERE id = ${lead.id} AND status = 'open'
    `
    refresh()
  }
  const digits = lead.phone.replace(/\D/g, '')
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
  return { ok: true as const, url }
}

export async function closeOutreachLead(_prev: OutreachActionState, formData: FormData): Promise<OutreachActionState> {
  const actor = await requireUpper((formData.get('creator_handle') ?? '').toString())
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id)) return { ok: false, message: 'Missing account.' }
  const lead = await getOutreachLead(id)
  if (!lead) return { ok: false, message: 'That account is not in the list.' }
  if (lead.status === 'closed') return { ok: false, message: 'Already added as a creator.' }
  if (blockedByOther(actor, lead)) {
    return { ok: false, message: `${lead.negotiatorName ?? 'Someone'} is negotiating with them.` }
  }
  if (await usernameTakenByCreator(lead.username)) {
    return { ok: false, message: `@${lead.username} is already a creator.` }
  }

  await ensureCreatorTrackingColumns()
  const platforms = normalizePlatforms((formData.get('platforms') ?? '').toString())
  const projectRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectRaw ? Number(projectRaw) : null
  if (projectId != null) {
    const projects = (await sql`SELECT id FROM projects WHERE id = ${projectId} LIMIT 1`) as { id: number }[]
    if (!projects[0]) return { ok: false, message: 'That project was not found.' }
  }

  const loginPlatform = platforms === 'instagram' ? 'instagram' : 'tiktok'
  const tiktok = platforms === 'instagram' ? null : lead.username
  const instagram = platforms === 'tiktok' ? null : lead.username
  const token = randomBytes(12).toString('hex')
  const notes = 'Added from outreach'

  let creatorId: number
  try {
    const rows = (await sql`
      INSERT INTO creators (
        name, token, project_id, role, goal_instagram, goal_tiktok, platforms,
        pay_every_days, notes, tiktok_username, instagram_username, login_platform
      )
      VALUES (
        ${lead.username}, ${token}, ${projectId}, 'creator', 0, 0, ${platforms},
        14, ${notes}, ${tiktok}, ${instagram}, ${loginPlatform}
      )
      RETURNING id
    `) as { id: number }[]
    if (!rows[0]) return { ok: false, message: 'Could not add the creator.' }
    creatorId = rows[0].id
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('username')) {
      return { ok: false, message: 'That username is already on another account.' }
    }
    throw error
  }

  await sql`
    UPDATE outreach_leads
    SET status = 'closed',
        creator_id = ${creatorId},
        negotiator_key = COALESCE(negotiator_key, ${actor.key}),
        negotiator_name = COALESCE(negotiator_name, ${actor.name}),
        updated_at = NOW()
    WHERE id = ${lead.id} AND status <> 'closed'
  `
  refresh()
  return { ok: true, message: `Added @${lead.username} as a creator.` }
}
