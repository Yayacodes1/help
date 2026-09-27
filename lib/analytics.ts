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
      AND (
        ${projectId}::int IS NULL
        OR c.project_id = ${projectId}
        OR EXISTS (
          SELECT 1 FROM submissions sp
          WHERE sp.creator_id = c.id AND sp.project_id = ${projectId}
        )
      )
    GROUP BY c.id, c.name, c.paused_at
    HAVING c.paused_at IS NULL OR COUNT(s.id) > 0
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

export type SheetRow = {
  date: string
  creator_id: number
  creator_name: string
  role: 'creator' | 'reposter'
  platform: 'instagram' | 'tiktok'
  videos: number
  views: number
}

/** Per day × person × platform video counts and views (all roles). */
export async function getDailySheet(opts: {
  from: string
  to: string
  projectId?: number | null
}): Promise<SheetRow[]> {
  const projectId = opts.projectId ?? null
  return (await sql`
    SELECT
      s.video_date::text AS date,
      c.id AS creator_id,
      c.name AS creator_name,
      CASE WHEN c.role = 'reposter' THEN 'reposter' ELSE 'creator' END AS role,
      s.platform,
      COUNT(s.id)::int AS videos,
      COALESCE(SUM(s.views), 0)::int AS views
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_date >= ${opts.from}::date
      AND s.video_date <= ${opts.to}::date
      AND s.platform IN ('instagram', 'tiktok')
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    GROUP BY s.video_date, c.id, c.name, c.role, s.platform
    ORDER BY s.video_date ASC, c.name ASC
  `) as SheetRow[]
}

/** `source`: manual | import | revenuecat (mixed when summed across projects). */
export type DailyDownloadsRow = {
  date: string
  downloads: number
  source: string
  /** New paid subscriptions (RevenueCat); null when never synced. */
  subscriptions: number | null
  /** Gross revenue USD (RevenueCat); null when never synced. */
  revenue: number | null
}

/** App downloads per day; summed across projects when projectId is null. */
export async function getDailyDownloads(opts: {
  from: string
  to: string
  projectId?: number | null
}): Promise<DailyDownloadsRow[]> {
  const projectId = opts.projectId ?? null
  return (await sql`
    SELECT
      day::text AS date,
      SUM(downloads)::int AS downloads,
      CASE WHEN COUNT(DISTINCT source) = 1 THEN MIN(source) ELSE 'mixed' END AS source,
      SUM(new_subscriptions)::int AS subscriptions,
      SUM(revenue)::float AS revenue
    FROM daily_downloads
    WHERE day >= ${opts.from}::date
      AND day <= ${opts.to}::date
      AND (${projectId}::int IS NULL OR project_id = ${projectId})
    GROUP BY day
    ORDER BY day ASC
  `) as DailyDownloadsRow[]
}

export type SheetDayVideo = {
  id: number
  creator_id: number
  creator_name: string
  role: 'creator' | 'reposter'
  platform: string
  url: string
  views: number
}

/** Every video posted on one day (for the tap-a-day breakdown). */
export async function getSheetDayVideos(opts: {
  day: string
  projectId?: number | null
}): Promise<SheetDayVideo[]> {
  const projectId = opts.projectId ?? null
  return (await sql`
    SELECT
      s.id,
      c.id AS creator_id,
      c.name AS creator_name,
      CASE WHEN c.role = 'reposter' THEN 'reposter' ELSE 'creator' END AS role,
      s.platform,
      s.url,
      COALESCE(s.views, 0)::int AS views
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_date = ${opts.day}::date
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    ORDER BY s.views DESC NULLS LAST, s.id ASC
  `) as SheetDayVideo[]
}

/** One person's videos in a range (for the creator timeline). */
export async function getSheetPersonVideos(opts: {
  creatorId: number
  from: string
  to: string
  projectId?: number | null
}): Promise<Array<SheetDayVideo & { date: string }>> {
  const projectId = opts.projectId ?? null
  return (await sql`
    SELECT
      s.id,
      c.id AS creator_id,
      c.name AS creator_name,
      CASE WHEN c.role = 'reposter' THEN 'reposter' ELSE 'creator' END AS role,
      s.platform,
      s.url,
      COALESCE(s.views, 0)::int AS views,
      to_char(s.video_date, 'YYYY-MM-DD') AS date
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.creator_id = ${opts.creatorId}
      AND s.video_date BETWEEN ${opts.from}::date AND ${opts.to}::date
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    ORDER BY s.views DESC NULLS LAST, s.id ASC
    LIMIT 500
  `) as Array<SheetDayVideo & { date: string }>
}

export function defaultAnalyticsRange(today: string): { from: string; to: string } {
  const { start, end } = monthRange(today)
  return { from: start, to: end }
}
