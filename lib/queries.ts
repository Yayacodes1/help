import 'server-only'
import { sql, type Contract, type Creator, type Platform, type Project, type Submission } from '@/lib/db'
import { maxDate, yearRange } from '@/lib/campaign'
import {
  buildConsistency,
  nextPayDate,
  type ConsistencySummary,
} from '@/lib/consistency'

export async function getServerToday(): Promise<string> {
  const rows = (await sql`SELECT CURRENT_DATE::text AS today`) as { today: string }[]
  return rows[0].today
}

export async function getCreatorByToken(token: string): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at,
           goal_instagram, goal_tiktok,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes
    FROM creators
    WHERE token = ${token}
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorById(id: number): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at,
           goal_instagram, goal_tiktok,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes
    FROM creators
    WHERE id = ${id}
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorByName(name: string): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at,
           goal_instagram, goal_tiktok,
           contract_start::text AS contract_start,
           contract_end::text AS contract_end,
           last_paid_at::text AS last_paid_at,
           pay_every_days, notes
    FROM creators
    WHERE lower(name) = lower(${name.trim()})
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getProjectById(id: number): Promise<Project | null> {
  const rows = (await sql`
    SELECT id, name, created_at FROM projects WHERE id = ${id} LIMIT 1
  `) as Project[]
  return rows[0] ?? null
}

export async function getSubmissionsForCreator(creatorId: number): Promise<Submission[]> {
  return (await sql`
    SELECT id, creator_id, project_id, platform, url, video_date::text AS video_date, views, created_at
    FROM submissions
    WHERE creator_id = ${creatorId}
    ORDER BY video_date DESC, created_at DESC
  `) as Submission[]
}

export async function getSubmissionsForCreatorOnDate(
  creatorId: number,
  date: string,
): Promise<Submission[]> {
  return (await sql`
    SELECT id, creator_id, project_id, platform, url, video_date::text AS video_date, views, created_at
    FROM submissions
    WHERE creator_id = ${creatorId} AND video_date = ${date}
    ORDER BY created_at DESC
  `) as Submission[]
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
  project_name: string | null
}

export type AdminFilters = {
  projectId?: number
  creatorId?: number
  platform?: Platform
  from?: string
  to?: string
}

export async function getAdminSubmissions(filters: AdminFilters = {}): Promise<AdminSubmissionRow[]> {
  const projectId = filters.projectId ?? null
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
      s.created_at,
      c.name AS creator_name,
      p.name AS project_name
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE (${projectId}::int IS NULL OR s.project_id = ${projectId})
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
    SELECT c.id, c.name, c.token, c.project_id, c.created_at,
           c.goal_instagram, c.goal_tiktok,
           c.contract_start::text AS contract_start,
           c.contract_end::text AS contract_end,
           c.last_paid_at::text AS last_paid_at,
           c.pay_every_days, c.notes,
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
): Promise<CreatorProgress[]> {
  const pid = projectId ?? null
  return (await sql`
    SELECT
      c.id, c.name, c.token, c.project_id, c.created_at,
      c.goal_instagram, c.goal_tiktok,
      c.contract_start::text AS contract_start,
      c.contract_end::text AS contract_end,
      c.last_paid_at::text AS last_paid_at,
      c.pay_every_days, c.notes,
      p.name AS project_name,
      COALESCE(SUM(CASE WHEN s.video_date = ${date}::date AND s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS today_instagram,
      COALESCE(SUM(CASE WHEN s.video_date = ${date}::date AND s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS today_tiktok,
      COALESCE(COUNT(s.id), 0)::int AS total_videos
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    LEFT JOIN submissions s ON s.creator_id = c.id
    WHERE (${pid}::int IS NULL OR c.project_id = ${pid})
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
           created_at
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
           created_at
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${today}::date
      AND (end_date IS NULL OR end_date >= ${today}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as Contract[]
  if (rows[0]) return rows[0]

  // Fallback: most recent contract if none covers today
  const latest = (await sql`
    SELECT id, creator_id, name,
           start_date::text AS start_date,
           end_date::text AS end_date,
           created_at
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
): Promise<ConsistencySummary> {
  const countsByDate = await getCreatorDailyPlatformCounts(creator.id, start, end)
  return buildConsistency({
    start,
    end,
    today,
    goalInstagram: creator.goal_instagram,
    goalTiktok: creator.goal_tiktok,
    countsByDate,
  })
}

export async function getCreatorConsistency(
  creator: Creator,
  today: string,
): Promise<ConsistencySummary> {
  const active = await getActiveContract(creator.id, today)
  const { start, end } = contractWindow(creator, today, active)
  return getConsistencyForWindow(creator, start, end, today)
}

export type ContractCompareRow = {
  contract: Contract
  consistency: ConsistencySummary
  videoCount: number
  isActive: boolean
}

export async function getContractComparisons(
  creator: Creator,
  today: string,
): Promise<ContractCompareRow[]> {
  const contracts = await getContractsForCreator(creator.id)
  const active = await getActiveContract(creator.id, today)
  const yearEnd = yearRange(today).end

  return Promise.all(
    contracts.map(async (contract) => {
      const end = contract.end_date ?? yearEnd
      const consistency = await getConsistencyForWindow(
        creator,
        contract.start_date,
        maxDate(contract.start_date, end),
        today,
      )
      const countRows = (await sql`
        SELECT COUNT(*)::int AS n
        FROM submissions
        WHERE creator_id = ${creator.id}
          AND video_date >= ${contract.start_date}::date
          AND video_date <= ${end}::date
      `) as { n: number }[]
      return {
        contract,
        consistency,
        videoCount: countRows[0]?.n ?? 0,
        isActive: active?.id === contract.id,
      }
    }),
  )
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
      const consistency = await getCreatorConsistency(c, today)
      const pay = await getPaySummary(c, today)
      return {
        ...c,
        current_streak: consistency.currentStreak,
        hit_rate: consistency.hitRate,
        next_pay_at: pay.nextPayAt,
        pay_due: pay.isDue,
      }
    }),
  )
}
