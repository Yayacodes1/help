import 'server-only'
import { sql } from '@/lib/db'

export type BreakRequestStatus = 'pending' | 'approved' | 'denied'
export type BreakRequestKind = 'break' | 'pause'

export type BreakRequest = {
  id: number
  leader_id: number
  leader_name: string
  creator_id: number
  creator_name: string
  creator_role: 'creator' | 'reposter'
  kind: BreakRequestKind
  start_date: string
  end_date: string
  days: number
  reason: string | null
  status: BreakRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  applied_at: string | null
  created_at: string
}

export function parseBreakKind(value: unknown): BreakRequestKind {
  return value === 'pause' ? 'pause' : 'break'
}

export async function ensureBreakRequestTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS break_requests (
      id SERIAL PRIMARY KEY,
      leader_id INTEGER NOT NULL REFERENCES leaders(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS break_requests_status_idx ON break_requests (status, created_at DESC)`
  await sql`ALTER TABLE break_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'break'`
  await sql`ALTER TABLE break_requests ADD COLUMN IF NOT EXISTS applied_at timestamptz`
  await sql`
    UPDATE break_requests
    SET applied_at = COALESCE(reviewed_at, created_at)
    WHERE status = 'approved' AND applied_at IS NULL
  `
}

function row(r: Record<string, unknown>): BreakRequest {
  const role = r.creator_role === 'reposter' ? 'reposter' : 'creator'
  const status =
    r.status === 'approved' || r.status === 'denied' ? (r.status as BreakRequestStatus) : 'pending'
  return {
    id: Number(r.id),
    leader_id: Number(r.leader_id),
    leader_name: String(r.leader_name ?? ''),
    creator_id: Number(r.creator_id),
    creator_name: String(r.creator_name ?? ''),
    creator_role: role,
    kind: parseBreakKind(r.kind),
    start_date: String(r.start_date),
    end_date: String(r.end_date),
    days: Number(r.days) || 1,
    reason: r.reason == null ? null : String(r.reason),
    status,
    reviewed_by: r.reviewed_by == null ? null : String(r.reviewed_by),
    reviewed_at: r.reviewed_at == null ? null : String(r.reviewed_at),
    applied_at: r.applied_at == null ? null : String(r.applied_at),
    created_at: String(r.created_at),
  }
}

export async function listBreakRequests(opts: {
  leaderId?: number
  status?: BreakRequestStatus | 'all'
  limit?: number
} = {}): Promise<BreakRequest[]> {
  await ensureBreakRequestTables()
  const limit = Math.min(Math.max(opts.limit ?? 80, 1), 200)
  const leaderId = opts.leaderId
  const status = opts.status ?? 'all'
  const rows = (
    leaderId != null
      ? status === 'all'
        ? await sql`
            SELECT r.id, r.leader_id, l.name AS leader_name, r.creator_id, c.name AS creator_name,
                   c.role AS creator_role, r.kind, r.start_date::text AS start_date, r.end_date::text AS end_date,
                   r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at::text AS reviewed_at,
                   r.applied_at::text AS applied_at, r.created_at::text AS created_at
            FROM break_requests r
            JOIN leaders l ON l.id = r.leader_id
            JOIN creators c ON c.id = r.creator_id
            WHERE r.leader_id = ${leaderId}
            ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT r.id, r.leader_id, l.name AS leader_name, r.creator_id, c.name AS creator_name,
                   c.role AS creator_role, r.kind, r.start_date::text AS start_date, r.end_date::text AS end_date,
                   r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at::text AS reviewed_at,
                   r.applied_at::text AS applied_at, r.created_at::text AS created_at
            FROM break_requests r
            JOIN leaders l ON l.id = r.leader_id
            JOIN creators c ON c.id = r.creator_id
            WHERE r.leader_id = ${leaderId} AND r.status = ${status}
            ORDER BY r.created_at DESC
            LIMIT ${limit}
          `
      : status === 'all'
        ? await sql`
            SELECT r.id, r.leader_id, l.name AS leader_name, r.creator_id, c.name AS creator_name,
                   c.role AS creator_role, r.kind, r.start_date::text AS start_date, r.end_date::text AS end_date,
                   r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at::text AS reviewed_at,
                   r.applied_at::text AS applied_at, r.created_at::text AS created_at
            FROM break_requests r
            JOIN leaders l ON l.id = r.leader_id
            JOIN creators c ON c.id = r.creator_id
            ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
            LIMIT ${limit}
          `
        : await sql`
            SELECT r.id, r.leader_id, l.name AS leader_name, r.creator_id, c.name AS creator_name,
                   c.role AS creator_role, r.kind, r.start_date::text AS start_date, r.end_date::text AS end_date,
                   r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at::text AS reviewed_at,
                   r.applied_at::text AS applied_at, r.created_at::text AS created_at
            FROM break_requests r
            JOIN leaders l ON l.id = r.leader_id
            JOIN creators c ON c.id = r.creator_id
            WHERE r.status = ${status}
            ORDER BY r.created_at DESC
            LIMIT ${limit}
          `
  ) as Record<string, unknown>[]
  return rows.map(row)
}

export async function createBreakRequest(input: {
  leaderId: number
  creatorId: number
  kind?: BreakRequestKind
  start: string
  end: string
  days: number
  reason: string | null
}): Promise<number | null> {
  await ensureBreakRequestTables()
  const kind = parseBreakKind(input.kind)
  const days = kind === 'pause' ? 1 : Math.max(1, Math.min(90, Math.floor(input.days) || 1))
  const inserted = (await sql`
    INSERT INTO break_requests (leader_id, creator_id, kind, start_date, end_date, days, reason, status)
    VALUES (
      ${input.leaderId}, ${input.creatorId}, ${kind},
      ${input.start}::date, ${input.end}::date, ${days}, ${input.reason}, 'pending'
    )
    RETURNING id
  `) as { id: number }[]
  return inserted[0]?.id ?? null
}

export async function getBreakRequest(id: number): Promise<BreakRequest | null> {
  await ensureBreakRequestTables()
  const rows = (await sql`
    SELECT r.id, r.leader_id, l.name AS leader_name, r.creator_id, c.name AS creator_name,
           c.role AS creator_role, r.kind, r.start_date::text AS start_date, r.end_date::text AS end_date,
           r.days, r.reason, r.status, r.reviewed_by, r.reviewed_at::text AS reviewed_at,
           r.applied_at::text AS applied_at, r.created_at::text AS created_at
    FROM break_requests r
    JOIN leaders l ON l.id = r.leader_id
    JOIN creators c ON c.id = r.creator_id
    WHERE r.id = ${id}
    LIMIT 1
  `) as Record<string, unknown>[]
  return rows[0] ? row(rows[0]) : null
}

export async function setBreakRequestStatus(
  id: number,
  status: 'approved' | 'denied',
  reviewedBy: string,
): Promise<BreakRequest | null> {
  await ensureBreakRequestTables()
  await sql`
    UPDATE break_requests
    SET status = ${status}, reviewed_by = ${reviewedBy}, reviewed_at = NOW()
    WHERE id = ${id} AND status = 'pending'
  `
  return getBreakRequest(id)
}

export async function claimBreakRequestToApply(
  id: number,
  leaderId: number,
): Promise<BreakRequest | null> {
  await ensureBreakRequestTables()
  const claimed = (await sql`
    UPDATE break_requests
    SET applied_at = NOW()
    WHERE id = ${id}
      AND leader_id = ${leaderId}
      AND status = 'approved'
      AND applied_at IS NULL
    RETURNING id
  `) as { id: number }[]
  if (!claimed[0]) return null
  return getBreakRequest(id)
}

export async function releaseBreakRequestClaim(id: number): Promise<void> {
  await sql`
    UPDATE break_requests SET applied_at = NULL
    WHERE id = ${id} AND status = 'approved'
  `
}
