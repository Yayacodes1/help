import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import { ensureLeaderTables } from '@/lib/leaders'
import {
  outreachStatusLabel,
  type OutreachLeadStatus,
} from '@/lib/outreach-status'

export type OutreachRole = 'upper' | 'outreach'

export type OutreachMember = {
  id: number
  name: string
  role: OutreachRole
  creatorId: number | null
  creatorName: string | null
  leaderId: number | null
  leaderName: string | null
  hasPassword: boolean
}

export type OutreachLeadRow = {
  id: number
  username: string
  phone: string
  followers: number | null
  likes: number | null
  platform: string | null
  status: OutreachLeadStatus
  statusLabel: string
  addedByKey: string
  addedByName: string
  negotiatorKey: string | null
  negotiatorName: string | null
  creatorId: number | null
  createdAt: string
}

type LeadSql = {
  id: number
  username: string
  phone: string
  followers: number | null
  likes: number | null
  platform: string | null
  status: string
  added_by_key: string
  added_by_name: string
  negotiator_key: string | null
  negotiator_name: string | null
  creator_id: number | null
  created_at: string
}

export async function ensureOutreachTables() {
  return ensureOnce('outreach', runEnsureOutreachTables)
}

async function runEnsureOutreachTables() {
  await ensureLeaderTables()
  await sql`
    CREATE TABLE IF NOT EXISTS outreach_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT,
      creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
      leader_id INTEGER REFERENCES leaders(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT outreach_members_role CHECK (role IN ('upper', 'outreach')),
      CONSTRAINT outreach_members_one_link CHECK (
        (password_hash IS NOT NULL AND creator_id IS NULL AND leader_id IS NULL)
        OR (password_hash IS NULL AND creator_id IS NOT NULL AND leader_id IS NULL)
        OR (password_hash IS NULL AND creator_id IS NULL AND leader_id IS NOT NULL)
      )
    )
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_members_creator_uidx
    ON outreach_members (creator_id) WHERE creator_id IS NOT NULL
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_members_leader_uidx
    ON outreach_members (leader_id) WHERE leader_id IS NOT NULL
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_members_login_name_uidx
    ON outreach_members (lower(btrim(name))) WHERE password_hash IS NOT NULL
  `
  await sql`
    CREATE TABLE IF NOT EXISTS outreach_leads (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_key TEXT NOT NULL,
      followers INTEGER,
      likes INTEGER,
      platform TEXT,
      account_image TEXT NOT NULL,
      chat_image TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      added_by_key TEXT NOT NULL,
      added_by_name TEXT NOT NULL,
      negotiator_key TEXT,
      negotiator_name TEXT,
      creator_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_username_uidx
    ON outreach_leads (username_key)
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_phone_uidx
    ON outreach_leads (phone_key)
  `
  await sql`
    CREATE TABLE IF NOT EXISTS outreach_templates (
      actor_key TEXT PRIMARY KEY,
      body TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

function asRole(value: string): OutreachRole {
  return value === 'upper' ? 'upper' : 'outreach'
}

function asStatus(value: string): OutreachLeadStatus {
  if (value === 'negotiating' || value === 'done' || value === 'passed' || value === 'closed') return value
  return 'open'
}

function mapLead(row: LeadSql): OutreachLeadRow {
  const status = asStatus(row.status)
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    followers: row.followers,
    likes: row.likes,
    platform: row.platform,
    status,
    statusLabel: outreachStatusLabel(status, row.negotiator_name),
    addedByKey: row.added_by_key,
    addedByName: row.added_by_name,
    negotiatorKey: row.negotiator_key,
    negotiatorName: row.negotiator_name,
    creatorId: row.creator_id,
    createdAt: row.created_at,
  }
}

export async function listOutreachMembers(): Promise<OutreachMember[]> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT m.id, m.name, m.role, m.creator_id, c.name AS creator_name,
           m.leader_id, l.name AS leader_name,
           (m.password_hash IS NOT NULL) AS has_password
    FROM outreach_members m
    LEFT JOIN creators c ON c.id = m.creator_id
    LEFT JOIN leaders l ON l.id = m.leader_id
    ORDER BY m.role ASC, m.name ASC
  `) as {
    id: number
    name: string
    role: string
    creator_id: number | null
    creator_name: string | null
    leader_id: number | null
    leader_name: string | null
    has_password: boolean
  }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: asRole(row.role),
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    leaderId: row.leader_id,
    leaderName: row.leader_name,
    hasPassword: row.has_password,
  }))
}

export async function listOutreachChoices(): Promise<{
  leaders: { id: number; name: string }[]
  reposters: { id: number; name: string }[]
}> {
  await ensureOutreachTables()
  const [leaderRows, reposterRows] = await Promise.all([
    sql`SELECT id, name FROM leaders ORDER BY name ASC`,
    sql`
      SELECT id, name FROM creators
      WHERE role = 'reposter' AND paused_at IS NULL
      ORDER BY name ASC
    `,
  ])
  return {
    leaders: leaderRows as { id: number; name: string }[],
    reposters: reposterRows as { id: number; name: string }[],
  }
}

export async function getOutreachMemberSecret(id: number): Promise<{
  id: number
  name: string
  role: OutreachRole
  password_hash: string
} | null> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, name, role, password_hash
    FROM outreach_members
    WHERE id = ${id} AND password_hash IS NOT NULL
    LIMIT 1
  `) as { id: number; name: string; role: string; password_hash: string }[]
  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, role: asRole(row.role), password_hash: row.password_hash }
}

export async function findOutreachLogin(name: string): Promise<{
  id: number
  name: string
  role: OutreachRole
  password_hash: string
} | null> {
  await ensureOutreachTables()
  const trimmed = name.trim()
  if (!trimmed) return null
  const rows = (await sql`
    SELECT id, name, role, password_hash
    FROM outreach_members
    WHERE password_hash IS NOT NULL AND lower(btrim(name)) = lower(${trimmed})
    LIMIT 1
  `) as { id: number; name: string; role: string; password_hash: string }[]
  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, role: asRole(row.role), password_hash: row.password_hash }
}

export async function getOutreachMemberByCreator(creatorId: number): Promise<{
  id: number
  name: string
  role: OutreachRole
} | null> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, name, role FROM outreach_members WHERE creator_id = ${creatorId} LIMIT 1
  `) as { id: number; name: string; role: string }[]
  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, role: asRole(row.role) }
}

export async function getOutreachMemberByLeader(leaderId: number): Promise<{
  id: number
  name: string
  role: OutreachRole
} | null> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, name, role FROM outreach_members WHERE leader_id = ${leaderId} LIMIT 1
  `) as { id: number; name: string; role: string }[]
  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, role: asRole(row.role) }
}

export async function listOutreachLeads(): Promise<OutreachLeadRow[]> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, username, phone, followers, likes, platform, status,
           added_by_key, added_by_name, negotiator_key, negotiator_name,
           creator_id, created_at::text AS created_at
    FROM outreach_leads
    ORDER BY id DESC
  `) as LeadSql[]
  return rows.map(mapLead)
}

export async function listOutreachLeadsByActor(actorKey: string): Promise<OutreachLeadRow[]> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, username, phone, followers, likes, platform, status,
           added_by_key, added_by_name, negotiator_key, negotiator_name,
           creator_id, created_at::text AS created_at
    FROM outreach_leads
    WHERE added_by_key = ${actorKey}
    ORDER BY id DESC
  `) as LeadSql[]
  return rows.map(mapLead)
}

export async function getOutreachLead(id: number): Promise<OutreachLeadRow | null> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT id, username, phone, followers, likes, platform, status,
           added_by_key, added_by_name, negotiator_key, negotiator_name,
           creator_id, created_at::text AS created_at
    FROM outreach_leads
    WHERE id = ${id}
    LIMIT 1
  `) as LeadSql[]
  return rows[0] ? mapLead(rows[0]) : null
}

export async function getOutreachLeadImage(
  id: number,
  kind: 'account' | 'chat',
): Promise<string | null> {
  await ensureOutreachTables()
  const rows =
    kind === 'account'
      ? ((await sql`SELECT account_image AS image FROM outreach_leads WHERE id = ${id} LIMIT 1`) as {
          image: string
        }[])
      : ((await sql`SELECT chat_image AS image FROM outreach_leads WHERE id = ${id} LIMIT 1`) as {
          image: string
        }[])
  return rows[0]?.image ?? null
}

export async function getOutreachTemplate(actorKey: string): Promise<string> {
  await ensureOutreachTables()
  const rows = (await sql`
    SELECT body FROM outreach_templates WHERE actor_key = ${actorKey} LIMIT 1
  `) as { body: string }[]
  return rows[0]?.body ?? ''
}

export type OutreachLookup =
  | { found: false }
  | { found: true; username: string; detail: string }

export async function lookupOutreach(query: string): Promise<OutreachLookup> {
  await ensureOutreachTables()
  const { normalizeOutreachPhone } = await import('@/lib/saudi-phone')
  const { cleanOutreachUsername, outreachStatusLabel } = await import('@/lib/outreach-status')
  const handle = cleanOutreachUsername(query)
  const phone = normalizeOutreachPhone(query)

  if (phone.ok) {
    const rows = (await sql`
      SELECT username, status, negotiator_name
      FROM outreach_leads
      WHERE phone_key = ${phone.key}
      LIMIT 1
    `) as { username: string; status: string; negotiator_name: string | null }[]
    if (rows[0]) {
      return {
        found: true,
        username: rows[0].username,
        detail: outreachStatusLabel(asStatus(rows[0].status), rows[0].negotiator_name),
      }
    }
  }

  if (handle) {
    const key = handle.toLowerCase()
    const leads = (await sql`
      SELECT username, status, negotiator_name
      FROM outreach_leads
      WHERE username_key = ${key}
      LIMIT 1
    `) as { username: string; status: string; negotiator_name: string | null }[]
    if (leads[0]) {
      return {
        found: true,
        username: leads[0].username,
        detail: outreachStatusLabel(asStatus(leads[0].status), leads[0].negotiator_name),
      }
    }
    const creators = (await sql`
      SELECT name FROM creators
      WHERE lower(name) = ${key}
         OR lower(COALESCE(tiktok_username, '')) = ${key}
         OR lower(COALESCE(instagram_username, '')) = ${key}
      LIMIT 1
    `) as { name: string }[]
    if (creators[0]) {
      return { found: true, username: handle, detail: 'Already a creator on the team' }
    }
  }

  return { found: false }
}

export async function usernameTakenByCreator(username: string): Promise<boolean> {
  const key = username.toLowerCase()
  const rows = (await sql`
    SELECT id FROM creators
    WHERE lower(name) = ${key}
       OR lower(COALESCE(tiktok_username, '')) = ${key}
       OR lower(COALESCE(instagram_username, '')) = ${key}
    LIMIT 1
  `) as { id: number }[]
  return rows.length > 0
}
