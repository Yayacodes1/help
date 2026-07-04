import 'server-only'
import { sql, type Creator, type Platform, type Project, type Submission } from '@/lib/db'

export async function getServerToday(): Promise<string> {
  const rows = (await sql`SELECT CURRENT_DATE::text AS today`) as { today: string }[]
  return rows[0].today
}

export async function getCreatorByToken(token: string): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at,
           goal_instagram, goal_tiktok
    FROM creators
    WHERE token = ${token}
    LIMIT 1
  `) as Creator[]
  return rows[0] ?? null
}

export async function getCreatorByName(name: string): Promise<Creator | null> {
  const rows = (await sql`
    SELECT id, name, token, project_id, created_at,
           goal_instagram, goal_tiktok
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
    SELECT id, creator_id, project_id, platform, url, video_date, views, created_at
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
    SELECT id, creator_id, project_id, platform, url, video_date, views, created_at
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
      s.video_date,
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

export async function getCreatorsWithTodayProgress(
  projectId?: number,
): Promise<CreatorProgress[]> {
  const pid = projectId ?? null
  return (await sql`
    SELECT
      c.id, c.name, c.token, c.project_id, c.created_at,
      c.goal_instagram, c.goal_tiktok,
      p.name AS project_name,
      COALESCE(SUM(CASE WHEN s.video_date = CURRENT_DATE AND s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS today_instagram,
      COALESCE(SUM(CASE WHEN s.video_date = CURRENT_DATE AND s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS today_tiktok,
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
