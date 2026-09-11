import 'server-only'
import { sql } from '@/lib/db'
import { monthRange } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'

export type DailyAnalyticsRow = {
  date: string
  views_instagram: number
  views_tiktok: number
  videos_instagram: number
  videos_tiktok: number
}

export type CreatorViewsRow = {
  creator_id: number
  creator_name: string
  videos: number
  views: number
  views_instagram: number
  views_tiktok: number
  videos_instagram: number
  videos_tiktok: number
}

export type CreatorDailyViewsRow = {
  date: string
  creator_id: number
  creator_name: string
  views: number
  videos: number
}

export type ViewsSummary = {
  from: string
  to: string
  creatorId: number | null
  projectId: number | null
  role: string | null
  videos: number
  views: number
  videos_instagram: number
  videos_tiktok: number
  views_instagram: number
  views_tiktok: number
  zero_view_videos: number
}

function normalizeRange(from?: string | null, to?: string | null, today?: string) {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const month = monthRange(t)
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : month.start
  const e = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : month.end
  return { from: f, to: e }
}

/** Daily views + video counts split by Instagram / TikTok. */
export async function getDailyAnalytics(opts: {
  from?: string | null
  to?: string | null
  creatorId?: number | null
  projectId?: number | null
  role?: string | null
} = {}): Promise<DailyAnalyticsRow[]> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const creatorId = opts.creatorId ?? null
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null

  const rows = (await sql`
    SELECT
      s.video_date::text AS date,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN s.views ELSE 0 END), 0)::int AS views_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN s.views ELSE 0 END), 0)::int AS views_tiktok,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS videos_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS videos_tiktok
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    GROUP BY s.video_date
    ORDER BY s.video_date ASC
  `) as DailyAnalyticsRow[]

  return rows
}

export async function getViewsSummary(opts: {
  from?: string | null
  to?: string | null
  creatorId?: number | null
  projectId?: number | null
  role?: string | null
} = {}): Promise<ViewsSummary> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const creatorId = opts.creatorId ?? null
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null

  const rows = (await sql`
    SELECT
      COALESCE(COUNT(*), 0)::int AS videos,
      COALESCE(SUM(s.views), 0)::int AS views,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS videos_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS videos_tiktok,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN s.views ELSE 0 END), 0)::int AS views_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN s.views ELSE 0 END), 0)::int AS views_tiktok,
      COALESCE(SUM(CASE WHEN s.views = 0 THEN 1 ELSE 0 END), 0)::int AS zero_view_videos
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
  `) as Omit<ViewsSummary, 'from' | 'to' | 'creatorId' | 'projectId' | 'role'>[]

  const r = rows[0]
  return {
    from,
    to,
    creatorId,
    projectId,
    role,
    videos: r?.videos ?? 0,
    views: r?.views ?? 0,
    videos_instagram: r?.videos_instagram ?? 0,
    videos_tiktok: r?.videos_tiktok ?? 0,
    views_instagram: r?.views_instagram ?? 0,
    views_tiktok: r?.views_tiktok ?? 0,
    zero_view_videos: r?.zero_view_videos ?? 0,
  }
}

/** Daily total views per creator (Instagram + TikTok combined). */
export async function getDailyViewsByCreator(opts: {
  from?: string | null
  to?: string | null
  projectId?: number | null
  role?: string | null
} = {}): Promise<CreatorDailyViewsRow[]> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null

  return (await sql`
    SELECT
      s.video_date::text AS date,
      c.id AS creator_id,
      c.name AS creator_name,
      COALESCE(SUM(s.views), 0)::int AS views,
      COUNT(s.id)::int AS videos
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    GROUP BY s.video_date, c.id, c.name
    ORDER BY s.video_date ASC, c.name ASC
  `) as CreatorDailyViewsRow[]
}

/** Creators ranked by total views in range. */
export async function getViewsLeaderboard(opts: {
  from?: string | null
  to?: string | null
  projectId?: number | null
  role?: string | null
  limit?: number
} = {}): Promise<CreatorViewsRow[]> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 10))

  return (await sql`
    SELECT
      c.id AS creator_id,
      c.name AS creator_name,
      COUNT(s.id)::int AS videos,
      COALESCE(SUM(s.views), 0)::int AS views,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN s.views ELSE 0 END), 0)::int AS views_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN s.views ELSE 0 END), 0)::int AS views_tiktok,
      COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS videos_instagram,
      COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS videos_tiktok
    FROM creators c
    LEFT JOIN submissions s
      ON s.creator_id = c.id
      AND s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    WHERE (${role}::text IS NULL OR c.role = ${role})
    GROUP BY c.id, c.name
    ORDER BY views DESC, videos DESC, c.name ASC
    LIMIT ${limit}
  `) as CreatorViewsRow[]
}

export type TopVideoRow = {
  id: number
  creator_id: number
  creator_name: string
  project_name: string | null
  platform: string
  url: string
  video_date: string
  views: number
}

/** Individual submissions ranked by views. */
export async function getTopVideos(opts: {
  from?: string | null
  to?: string | null
  projectId?: number | null
  role?: string | null
  platform?: string | null
  limit?: number
} = {}): Promise<TopVideoRow[]> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const platform = opts.platform === 'instagram' || opts.platform === 'tiktok' ? opts.platform : null
  const limit = Math.min(200, Math.max(1, opts.limit ?? 25))

  return (await sql`
    SELECT
      s.id,
      s.creator_id,
      c.name AS creator_name,
      p.name AS project_name,
      s.platform,
      s.url,
      s.video_date::text AS video_date,
      s.views
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (${platform}::text IS NULL OR s.platform = ${platform})
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    ORDER BY s.views DESC, s.video_date DESC, s.id DESC
    LIMIT ${limit}
  `) as TopVideoRow[]
}

export function defaultAnalyticsRange(today: string): { from: string; to: string } {
  const { start, end } = monthRange(today)
  return { from: start, to: end }
}
