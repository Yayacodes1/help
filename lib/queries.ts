import 'server-only'
import { sql, type Contract, type Creator, type Payment, type Platform, type Project, type ScheduleBreak, type Submission } from '@/lib/db'
import type { ParticipantRole } from '@/lib/participant-role'
import { addDays, maxDate, yearRange } from '@/lib/campaign'
import { normalizeHandle, type LoginPlatform } from '@/lib/usernames'
import {
  buildConsistency,
  eachDate,
  nextPayDate,
  type ConsistencySummary,
} from '@/lib/consistency'
import {
  normalizePlatforms,
  videoCompletionRate,
  type PlatformsMode,
} from '@/lib/platforms-mode'
import {
  buildContractHalves,
  contractHalfWindows,
  contractSupportsBiweeklyHalves,
  type ContractHalfStatus,
} from '@/lib/contract-halves'

export async function getServerToday(): Promise<string> {
  const rows = (await sql`SELECT CURRENT_DATE::text AS today`) as { today: string }[]
  return rows[0].today
}

/** 5am–5am posting day in Riyadh (used for reposter strikes). */
export async function getOperationalToday(): Promise<string> {
  const { operationalDayFromIso } = await import('@/lib/operational-day')
  const now = await getServerNowIso()
  return operationalDayFromIso(now)
}

/** UTC instant from the database — used as a live preview; inserts still use NOW(). */
export async function getServerNowIso(): Promise<string> {
  const rows = (await sql`
    SELECT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now
  `) as { now: string }[]
  return rows[0]?.now ?? new Date().toISOString()
}

export async function getCreatorByToken(token: string): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at, role,
           goal_instagram, goal_tiktok, platforms,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes, tiktok_username, instagram_username, login_platform
    FROM creators
    WHERE token = ${token}
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorById(id: number): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at, role,
           goal_instagram, goal_tiktok, platforms,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes, tiktok_username, instagram_username, login_platform
    FROM creators
    WHERE id = ${id}
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorByName(name: string): Promise<Creator | null> {
  const handle = normalizeHandle(name)
  if (!handle) return null
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at, role,
           goal_instagram, goal_tiktok, platforms,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes, tiktok_username, instagram_username, login_platform
    FROM creators
    WHERE lower(name) = lower(${handle})
       OR lower(COALESCE(tiktok_username, '')) = lower(${handle})
       OR lower(COALESCE(instagram_username, '')) = lower(${handle})
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorByLoginHandle(
  platform: LoginPlatform,
  username: string,
): Promise<Creator | null> {
  const handle = normalizeHandle(username)
  if (!handle) return null
  const rows =
    platform === 'instagram'
      ? ((await sql`
          SELECT id, name, token, project_id, created_at, role,
                 goal_instagram, goal_tiktok, platforms,
                 contract_start::text AS contract_start,
                 contract_end::text AS contract_end,
                 last_paid_at::text AS last_paid_at,
                 pay_every_days, notes, tiktok_username, instagram_username, login_platform
          FROM creators
          WHERE lower(COALESCE(instagram_username, '')) = lower(${handle})
          LIMIT 1
        `) as Creator[])
      : ((await sql`
          SELECT id, name, token, project_id, created_at, role,
                 goal_instagram, goal_tiktok, platforms,
                 contract_start::text AS contract_start,
                 contract_end::text AS contract_end,
                 last_paid_at::text AS last_paid_at,
                 pay_every_days, notes, tiktok_username, instagram_username, login_platform
          FROM creators
          WHERE lower(COALESCE(tiktok_username, '')) = lower(${handle})
          LIMIT 1
        `) as Creator[])
  return rows[0] ?? null
}

export async function getProjectById(id: number): Promise<Project | null> {
  const rows = (await sql`
    SELECT id, name, created_at FROM projects WHERE id = ${id} LIMIT 1
  `) as Project[]
  return rows[0] ?? null
}

export async function getSubmissionsForCreator(creatorId: number): Promise<Array<Submission & { project_name: string | null }>> {
  return (await sql`
    SELECT s.id, s.creator_id, s.project_id, s.platform, s.url, s.video_date::text AS video_date,
           s.views, s.views_error, s.created_at, s.batch_id, s.batch_index,
           p.name AS project_name
    FROM submissions s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE s.creator_id = ${creatorId}
    ORDER BY s.video_date DESC, s.created_at DESC
  `) as Array<Submission & { project_name: string | null }>
}

export async function getSubmissionsForCreatorOnDate(
  creatorId: number,
  date: string,
): Promise<Array<Submission & { project_name: string | null }>> {
  return (await sql`
    SELECT s.id, s.creator_id, s.project_id, s.platform, s.url, s.video_date::text AS video_date,
           s.views, s.views_error, s.created_at, s.batch_id, s.batch_index,
           p.name AS project_name
    FROM submissions s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE s.creator_id = ${creatorId} AND s.video_date = ${date}
    ORDER BY s.created_at DESC
  `) as Array<Submission & { project_name: string | null }>
}

export type PlatformCount = { platform: Platform; count: number }

export async function getCreatorCountsByPlatformOnDate(
  creatorId: number,
  date: string,
): Promise<Record<Platform, number>> {
  const rows = (await sql`
    SELECT platform, COUNT(*)::int AS count
    FROM submissions
    WHERE creator_id = ${creatorId} AND video_date = ${date}
    GROUP BY platform
  `) as PlatformCount[]
  const result: Record<Platform, number> = { instagram: 0, tiktok: 0 }
  for (const row of rows) {
    if (row.platform in result) result[row.platform] = row.count
  }
  return result
}

export type AdminSubmissionRow = Submission & {
  creator_name: string
  creator_role: ParticipantRole
  project_name: string | null
}

export type AdminFilters = {
  projectId?: number
  /** null / omitted = all roles; otherwise filter by participant role */
  role?: ParticipantRole | null
  creatorId?: number
  platform?: Platform
  from?: string
  to?: string
}

export async function getAdminSubmissions(filters: AdminFilters = {}): Promise<AdminSubmissionRow[]> {
  const projectId = filters.projectId ?? null
  const role = filters.role ?? null
  const creatorId = filters.creatorId ?? null
  const platform = filters.platform ?? null
  const from = filters.from ?? null
  const to = filters.to ?? null

  return (await sql`
    SELECT
      s.id,
      s.creator_id,
      s.project_id,
      s.platform,
      s.url,
      s.video_date::text AS video_date,
      s.views,
      s.views_error,
      s.created_at,
      s.batch_id,
      s.batch_index,
      c.name AS creator_name,
      c.role AS creator_role,
      p.name AS project_name
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE (${projectId}::int IS NULL OR s.project_id = ${projectId})
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
      AND (${platform}::text IS NULL OR s.platform = ${platform})
      AND (${from}::date IS NULL OR s.video_date >= ${from})
      AND (${to}::date IS NULL OR s.video_date <= ${to})
    ORDER BY s.video_date DESC, s.created_at DESC
  `) as AdminSubmissionRow[]
}

export async function getAllProjects(): Promise<Project[]> {
  return (await sql`
    SELECT id, name, created_at FROM projects ORDER BY name ASC
  `) as Project[]
}

export type CreatorWithProject = Creator & { project_name: string | null }

export async function getAllCreators(): Promise<CreatorWithProject[]> {
  return (await sql`
    SELECT c.id, c.name, c.token, c.project_id, c.created_at, c.role,
           c.goal_instagram, c.goal_tiktok, c.platforms,
           c.contract_start::text AS contract_start,
           c.contract_end::text AS contract_end,
           c.last_paid_at::text AS last_paid_at,
           c.pay_every_days, c.notes, c.tiktok_username, c.instagram_username, c.login_platform,
           p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    ORDER BY c.name ASC
  `) as CreatorWithProject[]
}

export type CreatorProgress = CreatorWithProject & {
  today_instagram: number
  today_tiktok: number
  total_videos: number
}

export async function getCreatorsWithProgressOnDate(
  date: string,
  projectId?: number,
  role?: ParticipantRole | null,
): Promise<CreatorProgress[]> {
  const pid = projectId ?? null
  const roleFilter = role ?? null
  return (await sql`
    SELECT
      c.id, c.name, c.token, c.project_id, c.created_at, c.role,
      c.goal_instagram, c.goal_tiktok, c.platforms,
      c.contract_start::text AS contract_start,
      c.contract_end::text AS contract_end,
      c.last_paid_at::text AS last_paid_at,
      c.pay_every_days, c.notes, c.tiktok_username, c.instagram_username, c.login_platform,
      p.name AS project_name,
      COALESCE(SUM(CASE WHEN s.video_date = ${date}::date AND s.platform = 'instagram' AND (${pid}::int IS NULL OR s.project_id = ${pid}) THEN 1 ELSE 0 END), 0)::int AS today_instagram,
      COALESCE(SUM(CASE WHEN s.video_date = ${date}::date AND s.platform = 'tiktok' AND (${pid}::int IS NULL OR s.project_id = ${pid}) THEN 1 ELSE 0 END), 0)::int AS today_tiktok,
      COALESCE(SUM(CASE WHEN s.id IS NOT NULL AND (${pid}::int IS NULL OR s.project_id = ${pid}) THEN 1 ELSE 0 END), 0)::int AS total_videos
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    LEFT JOIN submissions s ON s.creator_id = c.id
    WHERE (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
      AND (
        ${pid}::int IS NULL
        OR c.project_id = ${pid}
        OR EXISTS (
          SELECT 1 FROM submissions sx
          WHERE sx.creator_id = c.id AND sx.project_id = ${pid}
        )
      )
    GROUP BY c.id, p.name
    ORDER BY c.name ASC
  `) as CreatorProgress[]
}

export type CreatorStats = {
  total_videos: number
  instagram_videos: number
  tiktok_videos: number
  active_days: number
}

export async function getCreatorStats(creatorId: number): Promise<CreatorStats> {
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS total_videos,
      COALESCE(SUM(CASE WHEN platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS instagram_videos,
      COALESCE(SUM(CASE WHEN platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS tiktok_videos,
      COUNT(DISTINCT video_date)::int AS active_days
    FROM submissions
    WHERE creator_id = ${creatorId}
  `) as CreatorStats[]
  return rows[0] ?? { total_videos: 0, instagram_videos: 0, tiktok_videos: 0, active_days: 0 }
}

export type DailyCount = { video_date: string; count: number }

export async function getCreatorDailyCounts(creatorId: number): Promise<Record<string, number>> {
  const rows = (await sql`
    SELECT video_date::text AS video_date, COUNT(*)::int AS count
    FROM submissions
    WHERE creator_id = ${creatorId}
    GROUP BY video_date
  `) as DailyCount[]
  const map: Record<string, number> = {}
  for (const r of rows) map[r.video_date] = r.count
  return map
}

export type DailyPlatformRow = {
  video_date: string
  platform: Platform
  count: number
}

export async function getCreatorDailyPlatformCounts(
  creatorId: number,
  from: string,
  to: string,
): Promise<Record<string, { instagram: number; tiktok: number }>> {
  const rows = (await sql`
    SELECT video_date::text AS video_date, platform, COUNT(*)::int AS count
    FROM submissions
    WHERE creator_id = ${creatorId}
      AND video_date >= ${from}::date
      AND video_date <= ${to}::date
    GROUP BY video_date, platform
  `) as DailyPlatformRow[]

  const map: Record<string, { instagram: number; tiktok: number }> = {}
  for (const r of rows) {
    if (!map[r.video_date]) map[r.video_date] = { instagram: 0, tiktok: 0 }
    if (r.platform === 'instagram' || r.platform === 'tiktok') {
      map[r.video_date][r.platform] = r.count
    }
  }
  return map
}

export function contractWindow(
  creator: Pick<Creator, 'contract_start' | 'contract_end' | 'created_at'>,
  today: string,
  active?: Contract | null,
): { start: string; end: string } {
  if (active) {
    const end = active.end_date ?? yearRange(today).end
    return { start: active.start_date, end: maxDate(active.start_date, end) }
  }
  const { start: yearStart, end: yearEnd } = yearRange(today)
  const created =
    typeof creator.created_at === 'string'
      ? creator.created_at.slice(0, 10)
      : new Date(creator.created_at).toISOString().slice(0, 10)
  const start = creator.contract_start ?? maxDate(yearStart, created)
  const end = creator.contract_end ?? yearEnd
  return { start, end: maxDate(start, end) }
}

export async function getContractsForCreator(creatorId: number): Promise<Contract[]> {
  return (await sql`
    SELECT id, creator_id, name,
           start_date::text AS start_date,
           end_date::text AS end_date,
           created_at,
           goal_instagram, goal_tiktok,
           target_instagram, target_tiktok,
           platforms,
           base_amount::float AS base_amount,
           commission_amount::float AS commission_amount,
           count_mode, views_threshold,
           view_commission_amount::float AS view_commission_amount,
           commission_reels
    FROM contracts
    WHERE creator_id = ${creatorId}
    ORDER BY start_date DESC, id DESC
  `) as Contract[]
}

export async function getActiveContract(
  creatorId: number,
  today: string,
): Promise<Contract | null> {
  const rows = (await sql`
    SELECT id, creator_id, name,
           start_date::text AS start_date,
           end_date::text AS end_date,
           created_at,
           goal_instagram, goal_tiktok,
           target_instagram, target_tiktok,
           platforms,
           base_amount::float AS base_amount,
           commission_amount::float AS commission_amount,
           count_mode, views_threshold,
           view_commission_amount::float AS view_commission_amount,
           commission_reels
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${today}::date
      AND (end_date IS NULL OR end_date >= ${today}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as Contract[]
  if (rows[0]) return rows[0]

  const latest = (await sql`
    SELECT id, creator_id, name,
           start_date::text AS start_date,
           end_date::text AS end_date,
           created_at,
           goal_instagram, goal_tiktok,
           target_instagram, target_tiktok,
           platforms,
           base_amount::float AS base_amount,
           commission_amount::float AS commission_amount,
           count_mode, views_threshold,
           view_commission_amount::float AS view_commission_amount,
           commission_reels
    FROM contracts
    WHERE creator_id = ${creatorId}
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as Contract[]
  return latest[0] ?? null
}

export async function getConsistencyForWindow(
  creator: Creator,
  start: string,
  end: string,
  today: string,
  goals?: { goalInstagram: number; goalTiktok: number },
): Promise<ConsistencySummary> {
  const [countsByDate, breakDates] = await Promise.all([
    getCreatorDailyPlatformCounts(creator.id, start, end),
    getBreakDatesForCreator(creator.id, start, end),
  ])
  return buildConsistency({
    start,
    end,
    today,
    goalInstagram: goals?.goalInstagram ?? creator.goal_instagram,
    goalTiktok: goals?.goalTiktok ?? creator.goal_tiktok,
    countsByDate,
    breakDates,
  })
}

export async function getScheduleBreaks(creatorId: number): Promise<ScheduleBreak[]> {
  return (await sql`
    SELECT id, creator_id,
           start_date::text AS start_date,
           end_date::text AS end_date,
           reason, days_added, extended_contract_id, created_at
    FROM schedule_breaks
    WHERE creator_id = ${creatorId}
    ORDER BY start_date DESC, id DESC
  `) as ScheduleBreak[]
}

export async function getBreakDatesForCreator(
  creatorId: number,
  start: string,
  end: string,
): Promise<Set<string>> {
  const rows = (await sql`
    SELECT start_date::text AS start_date, end_date::text AS end_date
    FROM schedule_breaks
    WHERE creator_id = ${creatorId}
      AND start_date <= ${end}::date
      AND end_date >= ${start}::date
  `) as { start_date: string; end_date: string }[]
  const dates = new Set<string>()
  for (const row of rows) {
    const from = row.start_date < start ? start : row.start_date
    const to = row.end_date > end ? end : row.end_date
    for (const d of eachDate(from, to)) dates.add(d)
  }
  return dates
}

export function contractPlatforms(
  creator: Creator,
  contract: Contract | null | undefined,
): PlatformsMode {
  if (contract?.platforms) return normalizePlatforms(contract.platforms)
  return normalizePlatforms(creator.platforms)
}

/**
 * Daily goals for scoring consistency.
 * - Contract quotas win when the contract sets any daily/target numbers.
 * - Otherwise fall back to creator profile goals.
 * - Platform mode always zeros the unused network so it cannot tank %.
 */
export function goalsForContract(
  creator: Creator,
  contract: Contract | null | undefined,
): { goalInstagram: number; goalTiktok: number } {
  const mode = contractPlatforms(creator, contract)
  let goalInstagram: number
  let goalTiktok: number

  if (!contract) {
    goalInstagram = creator.goal_instagram
    goalTiktok = creator.goal_tiktok
  } else {
    const hasContractDaily = contract.goal_instagram > 0 || contract.goal_tiktok > 0
    const hasTargets = contract.target_instagram > 0 || contract.target_tiktok > 0
    // If the contract defines quotas/targets, trust its zeros (do not revive profile goals).
    if (hasContractDaily || hasTargets || normalizePlatforms(contract.platforms) !== 'both') {
      goalInstagram = contract.goal_instagram
      goalTiktok = contract.goal_tiktok
    } else {
      goalInstagram = creator.goal_instagram
      goalTiktok = creator.goal_tiktok
    }
  }

  if (mode === 'instagram') goalTiktok = 0
  if (mode === 'tiktok') goalInstagram = 0

  return { goalInstagram, goalTiktok }
}

export async function getCreatorConsistency(
  creator: Creator,
  today: string,
): Promise<ConsistencySummary> {
  const active = await getActiveContract(creator.id, today)
  const { start, end } = contractWindow(creator, today, active)
  return getConsistencyForWindow(creator, start, end, today, goalsForContract(creator, active))
}

export type ContractProgress = {
  instagram: number
  tiktok: number
  targetInstagram: number
  targetTiktok: number
}

/** ±1 day slack so late/early logged videos still count toward the contract total. */
export function contractVideoWindow(
  start: string,
  end: string,
): { start: string; end: string } {
  return {
    start: addDays(start, -1),
    end: addDays(end, 1),
  }
}

export async function getContractVideoCounts(
  creatorId: number,
  start: string,
  end: string,
  options?: { slackDays?: boolean },
): Promise<{ instagram: number; tiktok: number; total: number }> {
  const window =
    options?.slackDays === false
      ? { start, end }
      : contractVideoWindow(start, end)
  const rows = (await sql`
    SELECT
      COALESCE(SUM(CASE WHEN platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS instagram,
      COALESCE(SUM(CASE WHEN platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS tiktok,
      COUNT(*)::int AS total
    FROM submissions
    WHERE creator_id = ${creatorId}
      AND video_date >= ${window.start}::date
      AND video_date <= ${window.end}::date
  `) as { instagram: number; tiktok: number; total: number }[]
  return rows[0] ?? { instagram: 0, tiktok: 0, total: 0 }
}

export type ContractCompareRow = {
  contract: Contract
  consistency: ConsistencySummary
  videoCount: number
  postedInstagram: number
  postedTiktok: number
  targetTotal: number
  /** Video-target completion 0–1 when totals exist; else null */
  videoRate: number | null
  /** Prefer video completion (esp. past); fall back to days-hit */
  displayRate: number
  videosComplete: boolean
  isPast: boolean
  /** Past contracts: targets are final hits the admin entered, not goals. */
  manualHits: boolean
  paidAmount: number
  /** Base only when commission missing; base+commission when set */
  expectedTotal: number | null
  commissionMissing: boolean
  /** minimum due (base + commission-or-0) minus paid */
  balance: number
  /**
   * Always true so admins can record pay anytime (current, past, or upfront).
   * UI still only shows “still due” when balance > 0.
   */
  showBalanceDue: boolean
  isActive: boolean
  /**
   * Biweekly 1st/2nd half under this contract (month-length periods).
   * Empty when the span is too short for two waves.
   */
  halves: ContractHalfStatus[]
}

export function targetVideoTotal(contract: Contract): number {
  const mode = normalizePlatforms(contract.platforms)
  const ig = mode === 'tiktok' ? 0 : Math.max(0, contract.target_instagram)
  const tt = mode === 'instagram' ? 0 : Math.max(0, contract.target_tiktok)
  return ig + tt
}

export function expectedContractPay(contract: Contract): number | null {
  const base = Number(contract.base_amount) || 0
  if (contract.commission_amount == null) {
    return base > 0 ? base : null
  }
  return base + Number(contract.commission_amount)
}

/** Minimum owed for balance math: base + commission (0 if TBD). */
export function minimumContractDue(contract: Contract): number {
  const base = Number(contract.base_amount) || 0
  const commission =
    contract.commission_amount == null ? 0 : Number(contract.commission_amount)
  return Math.max(0, base + commission)
}

export async function getCreatorPaidTotal(creatorId: number): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS total
    FROM payments
    WHERE creator_id = ${creatorId}
  `) as { total: number }[]
  return rows[0]?.total ?? 0
}

export async function getAllPaidTotal(
  projectId?: number,
  role?: ParticipantRole | null,
): Promise<number> {
  const pid = projectId ?? null
  const roleFilter = role ?? null
  const rows = (await sql`
    SELECT COALESCE(SUM(p.amount), 0)::float AS total
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    WHERE (${pid}::int IS NULL OR c.project_id = ${pid})
      AND (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
  `) as { total: number }[]
  return rows[0]?.total ?? 0
}

/** Payments linked to the contract, plus unlinked ones whose paid_on falls in the period. */
export async function getPaidForContract(
  creatorId: number,
  contractId: number,
  start: string,
  end: string,
): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS total
    FROM payments
    WHERE creator_id = ${creatorId}
      AND (
        contract_id = ${contractId}
        OR (
          contract_id IS NULL
          AND paid_on >= ${start}::date
          AND paid_on <= ${end}::date
        )
      )
  `) as { total: number }[]
  return rows[0]?.total ?? 0
}

/** Individual payments attributed to a contract (linked or unlinked in the window). */
export async function getPaymentsForContract(
  creatorId: number,
  contractId: number,
  start: string,
  end: string,
): Promise<{ amount: number; paid_on: string; note: string | null }[]> {
  return (await sql`
    SELECT amount::float AS amount,
           paid_on::text AS paid_on,
           note
    FROM payments
    WHERE creator_id = ${creatorId}
      AND (
        contract_id = ${contractId}
        OR (
          contract_id IS NULL
          AND paid_on >= ${start}::date
          AND paid_on <= ${end}::date
        )
      )
    ORDER BY paid_on ASC, id ASC
  `) as { amount: number; paid_on: string; note: string | null }[]
}

/** Latest payment date for a contract (linked or unlinked in the period window). */
export async function getLastPaidOnForContract(
  creatorId: number,
  contractId: number,
  start: string,
  end: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT paid_on::text AS paid_on
    FROM payments
    WHERE creator_id = ${creatorId}
      AND (
        contract_id = ${contractId}
        OR (
          contract_id IS NULL
          AND paid_on >= ${start}::date
          AND paid_on <= ${end}::date
        )
      )
    ORDER BY paid_on DESC, id DESC
    LIMIT 1
  `) as { paid_on: string }[]
  return rows[0]?.paid_on ?? null
}

export async function getContractComparisons(
  creator: Creator,
  today: string,
): Promise<ContractCompareRow[]> {
  const contracts = await getContractsForCreator(creator.id)
  const active = await getActiveContract(creator.id, today)
  const yearEnd = yearRange(today).end
  const everyDays =
    creator.pay_every_days && creator.pay_every_days > 0
      ? Math.floor(creator.pay_every_days)
      : 14

  return Promise.all(
    contracts.map(async (contract) => {
      const end = contract.end_date ?? yearEnd
      const windowEnd = maxDate(contract.start_date, end)
      const consistency = await getConsistencyForWindow(
        creator,
        contract.start_date,
        windowEnd,
        today,
        goalsForContract(creator, contract),
      )
      const counts = await getContractVideoCounts(
        creator.id,
        contract.start_date,
        windowEnd,
      )
      const paidAmount = await getPaidForContract(
        creator.id,
        contract.id,
        contract.start_date,
        windowEnd,
      )
      const payments = await getPaymentsForContract(
        creator.id,
        contract.id,
        contract.start_date,
        windowEnd,
      )
      const isPast = contract.end_date != null && contract.end_date <= today
      const isActive = active?.id === contract.id
      // Past: targets you enter are final hits. Current: targets are goals.
      const manualHits =
        isPast &&
        !isActive &&
        (contract.target_instagram > 0 || contract.target_tiktok > 0)
      const postedInstagram = manualHits
        ? contract.target_instagram
        : counts.instagram
      const postedTiktok = manualHits
        ? contract.target_tiktok
        : counts.tiktok
      const videoCount = manualHits
        ? targetVideoTotal(contract)
        : counts.total
      const videoRate = manualHits
        ? 1
        : videoCompletionRate({
            postedInstagram: counts.instagram,
            postedTiktok: counts.tiktok,
            targetInstagram: contract.target_instagram,
            targetTiktok: contract.target_tiktok,
            platforms: contract.platforms,
          })
      const videosComplete = videoRate != null && videoRate >= 0.999
      // Prefer video totals whenever the contract has targets (past or current).
      const displayRate = videoRate != null ? videoRate : consistency.hitRate
      const commissionMissing = contract.commission_amount == null
      const minDue = minimumContractDue(contract)
      const balance = Math.max(0, Math.round((minDue - paidAmount) * 100) / 100)

      let halves: ContractHalfStatus[] = []
      if (
        contract.end_date &&
        contractSupportsBiweeklyHalves(contract.start_date, contract.end_date, everyDays)
      ) {
        const [w1, w2] = contractHalfWindows(
          contract.start_date,
          contract.end_date,
          everyDays,
        )
        const [firstVideos, secondVideos] = await Promise.all([
          getContractVideoCounts(creator.id, w1.start, w1.end, { slackDays: false }),
          getContractVideoCounts(creator.id, w2.start, w2.end, { slackDays: false }),
        ])
        halves = buildContractHalves({
          start: contract.start_date,
          end: contract.end_date,
          dueTotal: minDue,
          payments,
          everyDays,
          firstVideos,
          secondVideos,
        })
      }

      return {
        contract,
        consistency,
        videoCount,
        postedInstagram,
        postedTiktok,
        targetTotal: targetVideoTotal(contract),
        videoRate,
        displayRate,
        videosComplete,
        isPast,
        /** True when period totals were entered as final hits, not goals. */
        manualHits,
        paidAmount,
        expectedTotal: expectedContractPay(contract),
        commissionMissing,
        balance,
        /** Always true — you can record pay on current contracts anytime (including upfront). */
        showBalanceDue: true,
        isActive,
        halves,
      }
    }),
  )
}

export type PaymentDueRow = {
  creatorId: number
  creatorName: string
  contractId: number | null
  contractName: string | null
  dueDate: string
  reason: 'videos_complete' | 'pay_schedule'
  baseAmount: number
  commissionAmount: number | null
  commissionMissing: boolean
  expectedTotal: number | null
  paidAmount: number
  balance: number
  videoCount: number
  targetTotal: number
  videoRate: number | null
  videosComplete: boolean
  /** True = paid/settled history (keep after paying); false = still needs attention */
  settled: boolean
}

function buildDueRow(input: {
  creator: Creator
  contract: Contract | null
  dueDate: string
  reason: 'videos_complete' | 'pay_schedule'
  paidAmount: number
  counts: { total: number; instagram: number; tiktok: number }
  settled: boolean
}): PaymentDueRow {
  const contract = input.contract
  const baseAmount = contract ? Number(contract.base_amount) || 0 : 0
  const commissionMissing = !contract || contract.commission_amount == null
  const minDue = contract ? minimumContractDue(contract) : 0
  const balance = Math.max(0, Math.round((minDue - input.paidAmount) * 100) / 100)
  const videoRate = contract
    ? videoCompletionRate({
        postedInstagram: input.counts.instagram,
        postedTiktok: input.counts.tiktok,
        targetInstagram: contract.target_instagram,
        targetTiktok: contract.target_tiktok,
        platforms: contract.platforms,
      })
    : null
  return {
    creatorId: input.creator.id,
    creatorName: input.creator.name,
    contractId: contract?.id ?? null,
    contractName: contract?.name ?? null,
    dueDate: input.dueDate,
    reason: input.reason,
    baseAmount,
    commissionAmount:
      !contract || contract.commission_amount == null
        ? null
        : Number(contract.commission_amount),
    commissionMissing,
    expectedTotal: contract ? expectedContractPay(contract) : null,
    paidAmount: input.paidAmount,
    balance,
    videoCount: input.counts.total,
    targetTotal: contract ? targetVideoTotal(contract) : 0,
    videoRate,
    videosComplete: videoRate != null && videoRate >= 0.999,
    settled: input.settled,
  }
}

export async function getPaymentDueList(
  today: string,
  projectId?: number,
  role?: ParticipantRole | null,
): Promise<{ due: PaymentDueRow[]; settled: PaymentDueRow[] }> {
  const pid = projectId ?? null
  const roleFilter = role ?? null
  const creators = (await sql`
    SELECT id, name, token, project_id, created_at, role,
           goal_instagram, goal_tiktok, platforms,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes, tiktok_username, instagram_username, login_platform
    FROM creators
    WHERE (${pid}::int IS NULL OR project_id = ${pid} OR EXISTS (
      SELECT 1 FROM submissions sx WHERE sx.creator_id = creators.id AND sx.project_id = ${pid}
    ))
      AND (${roleFilter}::text IS NULL OR role = ${roleFilter})
    ORDER BY name ASC
  `) as Creator[]

  const due: PaymentDueRow[] = []
  const settled: PaymentDueRow[] = []

  for (const creator of creators) {
    const pay = await getPaySummary(creator, today)
    const contracts = await getContractsForCreator(creator.id)

    for (const contract of contracts) {
      const targets = targetVideoTotal(contract)
      const ended =
        contract.end_date != null && contract.end_date <= today

      // Count posts from contract start through today — end date does not gate due.
      const windowEnd = maxDate(contract.start_date, today)
      const counts =
        targets > 0
          ? await getContractVideoCounts(
              creator.id,
              contract.start_date,
              windowEnd,
            )
          : { total: 0, instagram: 0, tiktok: 0 }
      const paidAmount = await getPaidForContract(
        creator.id,
        contract.id,
        contract.start_date,
        windowEnd,
      )
      const videoRate =
        targets > 0
          ? videoCompletionRate({
              postedInstagram: counts.instagram,
              postedTiktok: counts.tiktok,
              targetInstagram: contract.target_instagram,
              targetTiktok: contract.target_tiktok,
              platforms: contract.platforms,
            })
          : null
      const videosComplete = videoRate != null && videoRate >= 0.999
      const minDue = minimumContractDue(contract)
      const commissionMissing = contract.commission_amount == null
      const fullySettled = minDue > 0 && paidAmount >= minDue - 0.009

      // Pay due: video target finished and money not fully recorded. End date ignored.
      if (
        videosComplete &&
        !fullySettled &&
        (minDue > 0 || commissionMissing)
      ) {
        due.push(
          buildDueRow({
            creator,
            contract,
            dueDate: today,
            reason: 'videos_complete',
            paidAmount,
            counts,
            settled: false,
          }),
        )
      }

      // Already paid history: settled after videos complete, or ended+paid (legacy).
      if (fullySettled && (videosComplete || ended)) {
        const lastPaidOn = await getLastPaidOnForContract(
          creator.id,
          contract.id,
          contract.start_date,
          windowEnd,
        )
        settled.push(
          buildDueRow({
            creator,
            contract,
            dueDate: lastPaidOn ?? contract.end_date ?? today,
            reason: videosComplete ? 'videos_complete' : 'pay_schedule',
            paidAmount,
            counts,
            settled: true,
          }),
        )
      }
    }

    if (pay.isDue && contracts.length === 0) {
      const paidTotal = await getCreatorPaidTotal(creator.id)
      due.push(
        buildDueRow({
          creator,
          contract: null,
          dueDate: pay.nextPayAt ?? today,
          reason: 'pay_schedule',
          paidAmount: paidTotal,
          counts: { total: 0, instagram: 0, tiktok: 0 },
          settled: false,
        }),
      )
    }
  }

  const byDate = (a: PaymentDueRow, b: PaymentDueRow) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    return a.creatorName.localeCompare(b.creatorName)
  }
  due.sort(byDate)
  settled.sort((a, b) => -byDate(a, b)) // newest paid history first

  return { due, settled }
}

export type PaymentRow = Payment & {
  creator_name?: string
  contract_name?: string | null
}

export async function getPaymentsForCreator(creatorId: number): Promise<PaymentRow[]> {
  return (await sql`
    SELECT p.id, p.creator_id, p.contract_id,
           p.paid_on::text AS paid_on,
           p.amount::float AS amount,
           p.note, p.created_at,
           ct.name AS contract_name
    FROM payments p
    LEFT JOIN contracts ct ON ct.id = p.contract_id
    WHERE p.creator_id = ${creatorId}
    ORDER BY p.paid_on DESC, p.id DESC
  `) as PaymentRow[]
}

export async function getLatestPayment(creatorId: number): Promise<Payment | null> {
  const rows = (await sql`
    SELECT id, creator_id, contract_id,
           paid_on::text AS paid_on,
           amount::float AS amount,
           note, created_at
    FROM payments
    WHERE creator_id = ${creatorId}
    ORDER BY paid_on DESC, id DESC
    LIMIT 1
  `) as Payment[]
  return rows[0] ?? null
}

export async function getPaymentsInRange(
  from: string,
  to: string,
  creatorId?: number,
  role?: ParticipantRole | null,
): Promise<PaymentRow[]> {
  const cid = creatorId ?? null
  const roleFilter = role ?? null
  return (await sql`
    SELECT p.id, p.creator_id, p.contract_id,
           p.paid_on::text AS paid_on,
           p.amount::float AS amount,
           p.note, p.created_at,
           c.name AS creator_name,
           ct.name AS contract_name
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN contracts ct ON ct.id = p.contract_id
    WHERE p.paid_on >= ${from}::date
      AND p.paid_on <= ${to}::date
      AND (${cid}::int IS NULL OR p.creator_id = ${cid})
      AND (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
    ORDER BY p.paid_on DESC, p.id DESC
  `) as PaymentRow[]
}

export async function getPaymentsTotalInRange(
  from: string,
  to: string,
  creatorId?: number,
  role?: ParticipantRole | null,
): Promise<number> {
  const cid = creatorId ?? null
  const roleFilter = role ?? null
  const rows = (await sql`
    SELECT COALESCE(SUM(p.amount), 0)::float AS total
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    WHERE p.paid_on >= ${from}::date
      AND p.paid_on <= ${to}::date
      AND (${cid}::int IS NULL OR p.creator_id = ${cid})
      AND (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
  `) as { total: number }[]
  return rows[0]?.total ?? 0
}

export type MissRow = {
  id: number
  name: string
  today_instagram: number
  today_tiktok: number
  goal_instagram: number
  goal_tiktok: number
  reason: 'miss' | 'partial'
}

export function getMissesFromProgress(creators: CreatorProgress[]): MissRow[] {
  const rows: MissRow[] = []
  for (const c of creators) {
    const hasGoal = c.goal_instagram > 0 || c.goal_tiktok > 0
    if (!hasGoal) continue
    const igOk = c.goal_instagram <= 0 || c.today_instagram >= c.goal_instagram
    const ttOk = c.goal_tiktok <= 0 || c.today_tiktok >= c.goal_tiktok
    if (igOk && ttOk) continue
    const any = c.today_instagram > 0 || c.today_tiktok > 0
    rows.push({
      id: c.id,
      name: c.name,
      today_instagram: c.today_instagram,
      today_tiktok: c.today_tiktok,
      goal_instagram: c.goal_instagram,
      goal_tiktok: c.goal_tiktok,
      reason: any ? 'partial' : 'miss',
    })
  }
  return rows
}

export type PaySummary = {
  lastPaidAt: string | null
  nextPayAt: string | null
  payEveryDays: number
  isDue: boolean
  overdueDays: number
}

export async function getPaySummary(creator: Creator, today: string): Promise<PaySummary> {
  const payEveryDays = creator.pay_every_days > 0 ? creator.pay_every_days : 14
  const active = await getActiveContract(creator.id, today)
  const nextPayAt = nextPayDate(
    creator.last_paid_at,
    payEveryDays,
    today,
    active?.start_date ?? creator.contract_start,
  )
  let overdueDays = 0
  let isDue = false
  if (nextPayAt) {
    isDue = nextPayAt <= today
    if (isDue) {
      const t = new Date(`${today}T00:00:00Z`).getTime()
      const n = new Date(`${nextPayAt}T00:00:00Z`).getTime()
      overdueDays = Math.max(0, Math.round((t - n) / 86_400_000))
    }
  }
  return {
    lastPaidAt: creator.last_paid_at,
    nextPayAt,
    payEveryDays,
    isDue,
    overdueDays,
  }
}

export type CreatorTrackingRow = CreatorProgress & {
  current_streak: number
  hit_rate: number
  next_pay_at: string | null
  pay_due: boolean
}

export async function attachTracking(
  creators: CreatorProgress[],
  today: string,
): Promise<CreatorTrackingRow[]> {
  return Promise.all(
    creators.map(async (c) => {
      const active = await getActiveContract(c.id, today)
      const goals = goalsForContract(c, active)
      const consistency = await getCreatorConsistency(c, today)
      const pay = await getPaySummary(c, today)
      return {
        ...c,
        // Today board / misses use effective contract goals (platform mode applied).
        goal_instagram: goals.goalInstagram,
        goal_tiktok: goals.goalTiktok,
        current_streak: consistency.currentStreak,
        hit_rate: consistency.hitRate,
        next_pay_at: pay.nextPayAt,
        pay_due: pay.isDue,
      }
    }),
  )
}
