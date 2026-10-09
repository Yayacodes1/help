import 'server-only'
import { cache } from 'react'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getAttendanceForDay } from '@/lib/attendance'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'
import { loginHandleFor } from '@/lib/usernames'
import {
  EMPTY_COUNTS,
  formatPlanCompare,
  onPlanPct,
  planDelta,
  type LeaderBoard,
  type LeaderDirectory,
  type LeaderRosterPerson,
  type LeaderScore,
  type PlanCounts,
} from '@/lib/leader-score'

export {
  EMPTY_COUNTS,
  formatPlanCompare,
  onPlanPct,
  planDelta,
  type LeaderBoard,
  type LeaderDirectory,
  type LeaderRosterPerson,
  type LeaderScore,
  type PlanCounts,
}

export type LeaderLink = { creatorId: number; leaderId: number; leaderName: string }

export async function ensureLeaderTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS leaders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      reposter_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS leader_id integer`
  try {
    await sql`
      ALTER TABLE creators
      ADD CONSTRAINT creators_leader_id_fkey
      FOREIGN KEY (leader_id) REFERENCES leaders(id) ON DELETE SET NULL
    `
  } catch {
    /* constraint already exists */
  }
  await sql`CREATE INDEX IF NOT EXISTS creators_leader_id_idx ON creators (leader_id)`
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS leaders_name_lower_idx
      ON leaders (lower(btrim(name)))
    `
  } catch {
    /* duplicate names already stored */
  }
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS leaders_reposter_uidx
      ON leaders (reposter_id)
      WHERE reposter_id IS NOT NULL
    `
  } catch {
    /* already linked twice */
  }
  await sql`
    CREATE TABLE IF NOT EXISTS leader_checks (
      leader_id INTEGER NOT NULL REFERENCES leaders(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      note TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (leader_id, creator_id, day)
    )
  `
}

function countStatuses(people: AttendancePerson[]): PlanCounts {
  const c: PlanCounts = { posted: 0, partial: 0, missed: 0, away: 0 }
  for (const p of people) {
    if (p.status === 'hit') c.posted++
    else if (p.status === 'partial') c.partial++
    else if (p.status === 'break' || p.status === 'off') c.away++
    else c.missed++
  }
  return c
}

type LeaderRow = {
  id: number
  name: string
  reposter_id: number | null
  reposter_name: string | null
  reposter_tiktok: string | null
  reposter_instagram: string | null
  reposter_login: string | null
}

type CheckRow = { leader_id: number; creator_id: number; note: string | null }

async function loadContext(day: string): Promise<{
  leaders: LeaderRow[]
  leaderByCreator: Map<number, number>
  checks: CheckRow[]
}> {
  await ensureLeaderTables()
  const [leaderRows, assignedRows, checkRows] = await Promise.all([
    sql`
      SELECT l.id, l.name, l.reposter_id,
             r.name AS reposter_name,
             r.tiktok_username AS reposter_tiktok,
             r.instagram_username AS reposter_instagram,
             r.login_platform AS reposter_login
      FROM leaders l
      LEFT JOIN creators r ON r.id = l.reposter_id
      ORDER BY l.name ASC
    `,
    sql`
      SELECT id, leader_id
      FROM creators
      WHERE role = 'creator' AND leader_id IS NOT NULL
    `,
    sql`
      SELECT leader_id, creator_id, note
      FROM leader_checks
      WHERE day = ${day}::date
    `,
  ])
  const leaders = leaderRows as LeaderRow[]
  const assigned = assignedRows as { id: number; leader_id: number }[]
  const checks = checkRows as CheckRow[]
  const leaderByCreator = new Map(assigned.map((row) => [row.id, row.leader_id]))
  return { leaders, leaderByCreator, checks }
}

function personRow(
  p: AttendancePerson,
  yesterday: Map<number, AttendancePerson>,
  check: CheckRow | undefined,
): LeaderRosterPerson {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    yesterdayStatus: yesterday.get(p.id)?.status ?? null,
    todayInstagram: p.todayInstagram,
    todayTiktok: p.todayTiktok,
    goalInstagram: p.goalInstagram,
    goalTiktok: p.goalTiktok,
    missStreak: p.missStreak,
    contractStrikes: p.contractStrikes,
    maxStrikes: p.maxStrikes,
    checked: check != null,
    note: check?.note ?? null,
  }
}

const STATUS_ORDER: Record<AttendanceStatus, number> = {
  miss: 0,
  partial: 1,
  hit: 2,
  break: 3,
  off: 4,
}

function sortPeople(people: LeaderRosterPerson[]): LeaderRosterPerson[] {
  return [...people].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  )
}

function isAtRisk(p: LeaderRosterPerson): boolean {
  if (p.status === 'break' || p.status === 'off') return false
  return p.contractStrikes > 0 || p.missStreak >= 2
}

function scoreGroup(
  leaderId: number | null,
  name: string,
  peopleToday: AttendancePerson[],
  peopleYesterday: AttendancePerson[],
  yesterdayById: Map<number, AttendancePerson>,
  checksForLeader: Map<number, CheckRow>,
  reposter: {
    id: number | null
    name: string | null
    handle: string | null
    status: AttendanceStatus | null
  },
): LeaderScore {
  const today = countStatuses(peopleToday)
  const yesterday = countStatuses(peopleYesterday)
  const people = sortPeople(peopleToday.map((p) => personRow(p, yesterdayById, checksForLeader.get(p.id))))
  return {
    leaderId,
    name,
    todayPct: onPlanPct(today),
    yesterdayPct: onPlanPct(yesterday),
    today,
    yesterday,
    checks: people.filter((p) => p.checked).length,
    roster: people.length,
    atRisk: people.filter(isAtRisk).length,
    reposterId: reposter.id,
    reposterName: reposter.name,
    reposterHandle: reposter.handle,
    reposterStatus: reposter.status,
    people,
  }
}

function compareScores(a: LeaderScore, b: LeaderScore): number {
  const ap = a.todayPct
  const bp = b.todayPct
  if (ap == null && bp == null) return a.name.localeCompare(b.name)
  if (ap == null) return 1
  if (bp == null) return -1
  if (bp !== ap) return bp - ap
  return a.name.localeCompare(b.name)
}

export function scoreLeaderBoard(
  day: string,
  todayPeople: AttendancePerson[],
  yesterdayPeople: AttendancePerson[],
  ctx: {
    leaders: LeaderRow[]
    leaderByCreator: Map<number, number>
    checks: CheckRow[]
  },
): LeaderBoard {
  const prevDay = addDays(day, -1)
  const yesterdayById = new Map(yesterdayPeople.map((p) => [p.id, p]))
  const todayById = new Map(todayPeople.map((p) => [p.id, p]))
  const creatorsToday = todayPeople.filter((p) => p.role === 'creator')
  const creatorsYesterday = yesterdayPeople.filter((p) => p.role === 'creator')
  const checksByLeader = new Map<number, Map<number, CheckRow>>()
  for (const check of ctx.checks) {
    const bucket = checksByLeader.get(check.leader_id) ?? new Map<number, CheckRow>()
    bucket.set(check.creator_id, check)
    checksByLeader.set(check.leader_id, bucket)
  }

  const leaders = ctx.leaders.map((leader) => {
    const mine = (p: AttendancePerson) => ctx.leaderByCreator.get(p.id) === leader.id
    const reposter = leader.reposter_id != null ? todayById.get(leader.reposter_id) : undefined
    const handle =
      leader.reposter_id != null
        ? loginHandleFor({
            name: leader.reposter_name,
            tiktok_username: leader.reposter_tiktok,
            instagram_username: leader.reposter_instagram,
            login_platform: leader.reposter_login,
          }).handle
        : null
    return scoreGroup(
      leader.id,
      leader.name,
      creatorsToday.filter(mine),
      creatorsYesterday.filter(mine),
      yesterdayById,
      checksByLeader.get(leader.id) ?? new Map(),
      {
        id: leader.reposter_id,
        name: leader.reposter_name,
        handle,
        status: reposter?.status ?? null,
      },
    )
  })
  leaders.sort(compareScores)

  const assigned = new Set(ctx.leaderByCreator.keys())
  const looseToday = creatorsToday.filter((p) => !assigned.has(p.id))
  const looseYesterday = creatorsYesterday.filter((p) => !assigned.has(p.id))
  const unassigned =
    looseToday.length > 0
      ? scoreGroup(null, 'No leader', looseToday, looseYesterday, yesterdayById, new Map(), {
          id: null,
          name: null,
          handle: null,
          status: null,
        })
      : null

  return {
    day,
    prevDay,
    all: {
      today: countStatuses(creatorsToday),
      yesterday: countStatuses(creatorsYesterday),
      todayPct: onPlanPct(countStatuses(creatorsToday)),
      yesterdayPct: onPlanPct(countStatuses(creatorsYesterday)),
    },
    leaders,
    unassigned,
  }
}

export const getLeaderBoard = cache(async function getLeaderBoard(
  day: string,
  preloaded?: { today: AttendancePerson[]; yesterday: AttendancePerson[] },
): Promise<LeaderBoard> {
  const prevDay = addDays(day, -1)
  const [today, yesterday, ctx] = await Promise.all([
    preloaded ? Promise.resolve(preloaded.today) : getAttendanceForDay(day),
    preloaded ? Promise.resolve(preloaded.yesterday) : getAttendanceForDay(prevDay),
    loadContext(day),
  ])
  return scoreLeaderBoard(day, today, yesterday, ctx)
})

export async function getLeaderSecret(
  id: number,
): Promise<{ id: number; name: string; password_hash: string } | null> {
  await ensureLeaderTables()
  const rows = (await sql`
    SELECT id, name, password_hash FROM leaders WHERE id = ${id} LIMIT 1
  `) as { id: number; name: string; password_hash: string }[]
  return rows[0] ?? null
}

export async function findLeaderByName(
  name: string,
): Promise<{ id: number; name: string; password_hash: string } | null> {
  await ensureLeaderTables()
  const trimmed = name.trim()
  if (!trimmed) return null
  const rows = (await sql`
    SELECT id, name, password_hash
    FROM leaders
    WHERE lower(btrim(name)) = lower(${trimmed})
    LIMIT 1
  `) as { id: number; name: string; password_hash: string }[]
  return rows[0] ?? null
}

export async function getLeaderForCreator(
  creatorId: number,
): Promise<{ id: number; name: string } | null> {
  await ensureLeaderTables()
  const rows = (await sql`
    SELECT l.id, l.name
    FROM creators c
    JOIN leaders l ON l.id = c.leader_id
    WHERE c.id = ${creatorId}
    LIMIT 1
  `) as { id: number; name: string }[]
  return rows[0] ?? null
}

export async function loadLeaderLinks(): Promise<{
  leaders: { id: number; name: string }[]
  assignments: LeaderLink[]
}> {
  await ensureLeaderTables()
  const [leaderRows, assignmentRows] = await Promise.all([
    sql`SELECT id, name FROM leaders ORDER BY name ASC`,
    sql`
      SELECT c.id AS creator_id, c.leader_id, l.name AS leader_name
      FROM creators c
      JOIN leaders l ON l.id = c.leader_id
      WHERE c.leader_id IS NOT NULL
    `,
  ])
  const leaders = leaderRows as { id: number; name: string }[]
  const assignments = assignmentRows as { creator_id: number; leader_id: number; leader_name: string }[]
  return {
    leaders,
    assignments: assignments.map((row) => ({
      creatorId: row.creator_id,
      leaderId: row.leader_id,
      leaderName: row.leader_name,
    })),
  }
}

export function withLeaderFields<T extends { id: number }>(
  rows: T[],
  assignments: LeaderLink[],
): Array<T & { leader_id: number | null; leader_name: string | null }> {
  const byCreator = new Map(assignments.map((a) => [a.creatorId, a]))
  return rows.map((row) => {
    const link = byCreator.get(row.id)
    return {
      ...row,
      leader_id: link?.leaderId ?? null,
      leader_name: link?.leaderName ?? null,
    }
  })
}

export async function getLeaderDirectory(): Promise<LeaderDirectory> {
  await ensureLeaderTables()
  const [leaderRows, creatorRows, reposterRows, linkRows] = await Promise.all([
    sql`
      SELECT l.id, l.name, l.reposter_id, r.name AS reposter_name
      FROM leaders l
      LEFT JOIN creators r ON r.id = l.reposter_id
      ORDER BY l.name ASC
    `,
    sql`
      SELECT id, name, leader_id
      FROM creators
      WHERE role = 'creator' AND paused_at IS NULL
      ORDER BY name ASC
    `,
    sql`
      SELECT id, name
      FROM creators
      WHERE role = 'reposter' AND paused_at IS NULL
      ORDER BY name ASC
    `,
    sql`
      SELECT id, leader_id FROM creators WHERE role = 'creator' AND leader_id IS NOT NULL
    `,
  ])
  const leaders = leaderRows as {
    id: number
    name: string
    reposter_id: number | null
    reposter_name: string | null
  }[]
  const creators = creatorRows as { id: number; name: string; leader_id: number | null }[]
  const reposters = reposterRows as { id: number; name: string }[]
  const links = linkRows as { id: number; leader_id: number }[]
  const idsByLeader = new Map<number, number[]>()
  for (const link of links) {
    const list = idsByLeader.get(link.leader_id) ?? []
    list.push(link.id)
    idsByLeader.set(link.leader_id, list)
  }
  return {
    leaders: leaders.map((l) => ({
      id: l.id,
      name: l.name,
      reposterId: l.reposter_id,
      reposterName: l.reposter_name,
      creatorIds: idsByLeader.get(l.id) ?? [],
    })),
    creators: creators.map((c) => ({ id: c.id, name: c.name, leaderId: c.leader_id })),
    reposters,
  }
}

export async function creatorBelongsToLeader(creatorId: number, leaderId: number): Promise<boolean> {
  await ensureLeaderTables()
  const rows = (await sql`
    SELECT id FROM creators
    WHERE id = ${creatorId} AND leader_id = ${leaderId} AND role = 'creator'
    LIMIT 1
  `) as { id: number }[]
  return rows[0] != null
}
