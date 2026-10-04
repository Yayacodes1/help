import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { formatDate, formatNumber } from '@/lib/format'

export async function ensureContractReviewsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS contract_reviews (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      week_number INTEGER NOT NULL,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      videos INTEGER NOT NULL DEFAULT 0,
      instagram INTEGER NOT NULL DEFAULT 0,
      tiktok INTEGER NOT NULL DEFAULT 0,
      views BIGINT NOT NULL DEFAULT 0,
      prev_videos INTEGER,
      prev_views BIGINT,
      top_url TEXT,
      top_views INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contract_id, week_number)
    )
  `
}

export type ContractReview = {
  id: number
  creatorId: number
  creatorName: string
  projectName: string | null
  contractName: string
  contractStart: string
  contractEnd: string | null
  weekNumber: number
  weekStart: string
  weekEnd: string
  videos: number
  instagram: number
  tiktok: number
  views: number
  prevVideos: number | null
  prevViews: number | null
  topUrl: string | null
  topViews: number | null
  profiles: Array<{ label: string; url: string }>
}

type ReviewRow = {
  id: number
  creator_id: number
  creator_name: string
  project_name: string | null
  contract_name: string
  contract_start: string
  contract_end: string | null
  week_number: number
  week_start: string
  week_end: string
  videos: number
  instagram: number
  tiktok: number
  views: number
  prev_videos: number | null
  prev_views: number | null
  top_url: string | null
  top_views: number | null
  tiktok_username: string | null
  instagram_username: string | null
  notek_tiktok_username: string | null
  notek_instagram_username: string | null
  miqat_tiktok_username: string | null
  miqat_instagram_username: string | null
}

function profileLinks(row: ReviewRow): Array<{ label: string; url: string }> {
  const clean = (h: string | null) => (h ?? '').trim().replace(/^@+/, '')
  const out: Array<{ label: string; url: string }> = []
  const seen = new Set<string>()
  const add = (label: string, platform: 'tiktok' | 'instagram', handle: string | null) => {
    const h = clean(handle)
    if (!h) return
    const url =
      platform === 'tiktok' ? `https://www.tiktok.com/@${h}` : `https://www.instagram.com/${h}`
    if (seen.has(url.toLowerCase())) return
    seen.add(url.toLowerCase())
    out.push({ label, url })
  }
  add('TikTok', 'tiktok', row.tiktok_username)
  add('Instagram', 'instagram', row.instagram_username)
  add('Notek TikTok', 'tiktok', row.notek_tiktok_username)
  add('Notek Instagram', 'instagram', row.notek_instagram_username)
  add('Miqat TikTok', 'tiktok', row.miqat_tiktok_username)
  add('Miqat Instagram', 'instagram', row.miqat_instagram_username)
  return out
}

function toReview(row: ReviewRow): ContractReview {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    projectName: row.project_name,
    contractName: row.contract_name,
    contractStart: row.contract_start,
    contractEnd: row.contract_end,
    weekNumber: row.week_number,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    videos: row.videos,
    instagram: row.instagram,
    tiktok: row.tiktok,
    views: Number(row.views) || 0,
    prevVideos: row.prev_videos,
    prevViews: row.prev_views == null ? null : Number(row.prev_views),
    topUrl: row.top_url,
    topViews: row.top_views,
    profiles: profileLinks(row),
  }
}

async function selectReviews(where: { ids?: number[]; pendingOnly?: boolean }): Promise<ContractReview[]> {
  const ids = where.ids ?? null
  const pendingOnly = where.pendingOnly === true
  const rows = (await sql`
    SELECT r.id, r.creator_id, c.name AS creator_name, p.name AS project_name,
           ct.name AS contract_name,
           ct.start_date::text AS contract_start, ct.end_date::text AS contract_end,
           r.week_number, r.week_start::text AS week_start, r.week_end::text AS week_end,
           r.videos, r.instagram, r.tiktok, r.views::float8 AS views,
           r.prev_videos, r.prev_views::float8 AS prev_views,
           r.top_url, r.top_views,
           c.tiktok_username, c.instagram_username,
           c.notek_tiktok_username, c.notek_instagram_username,
           c.miqat_tiktok_username, c.miqat_instagram_username
    FROM contract_reviews r
    JOIN creators c ON c.id = r.creator_id
    JOIN contracts ct ON ct.id = r.contract_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE (${ids}::int[] IS NULL OR r.id = ANY(${ids}::int[]))
      AND (${pendingOnly}::boolean IS NOT TRUE OR r.reviewed_at IS NULL)
    ORDER BY p.name NULLS LAST, r.week_end DESC, c.name ASC
  `) as ReviewRow[]
  return rows.map(toReview)
}

export async function getPendingContractReviews(): Promise<ContractReview[]> {
  await ensureContractReviewsTable()
  return selectReviews({ pendingOnly: true })
}

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
}

/**
 * Records every creator contract week that ended on or before `lastCompleted` (within the last
 * 7 days, so a missed cron run still catches up without flooding old weeks). Returns new rows only.
 */
export async function syncContractReviews(lastCompleted: string): Promise<ContractReview[]> {
  await ensureContractReviewsTable()
  const contracts = (await sql`
    SELECT ct.id, ct.creator_id,
           ct.start_date::text AS start_date, ct.end_date::text AS end_date
    FROM contracts ct
    JOIN creators c ON c.id = ct.creator_id
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND ct.start_date <= ${lastCompleted}::date
      AND (ct.end_date IS NULL OR ct.end_date >= ${addDays(lastCompleted, -6)}::date)
  `) as Array<{ id: number; creator_id: number; start_date: string; end_date: string | null }>

  const insertedIds: number[] = []
  for (const ct of contracts) {
    const lastDay = ct.end_date && ct.end_date < lastCompleted ? ct.end_date : lastCompleted
    const week = Math.floor((dayNumber(lastDay) - dayNumber(ct.start_date) + 1) / 7)
    if (week < 1) continue
    const weekStart = addDays(ct.start_date, (week - 1) * 7)
    const weekEnd = addDays(weekStart, 6)
    if (weekEnd < addDays(lastCompleted, -6)) continue
    const prevStart = week > 1 ? addDays(weekStart, -7) : weekStart

    const [stats] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE video_date >= ${weekStart}::date)::int AS videos,
        COUNT(*) FILTER (WHERE video_date >= ${weekStart}::date AND platform = 'instagram')::int AS instagram,
        COUNT(*) FILTER (WHERE video_date >= ${weekStart}::date AND platform = 'tiktok')::int AS tiktok,
        COALESCE(SUM(views) FILTER (WHERE video_date >= ${weekStart}::date), 0)::float8 AS views,
        COUNT(*) FILTER (WHERE video_date < ${weekStart}::date)::int AS prev_videos,
        COALESCE(SUM(views) FILTER (WHERE video_date < ${weekStart}::date), 0)::float8 AS prev_views
      FROM submissions
      WHERE creator_id = ${ct.creator_id}
        AND video_date >= ${prevStart}::date
        AND video_date <= ${weekEnd}::date
    `) as Array<{
      videos: number
      instagram: number
      tiktok: number
      views: number
      prev_videos: number
      prev_views: number
    }>
    const [top] = (await sql`
      SELECT url, views FROM submissions
      WHERE creator_id = ${ct.creator_id}
        AND video_date >= ${weekStart}::date
        AND video_date <= ${weekEnd}::date
      ORDER BY views DESC NULLS LAST, id DESC
      LIMIT 1
    `) as Array<{ url: string; views: number }>

    const rows = (await sql`
      INSERT INTO contract_reviews (
        creator_id, contract_id, week_number, week_start, week_end,
        videos, instagram, tiktok, views, prev_videos, prev_views, top_url, top_views
      )
      VALUES (
        ${ct.creator_id}, ${ct.id}, ${week}, ${weekStart}::date, ${weekEnd}::date,
        ${stats?.videos ?? 0}, ${stats?.instagram ?? 0}, ${stats?.tiktok ?? 0},
        ${Math.round(stats?.views ?? 0)},
        ${week > 1 ? (stats?.prev_videos ?? 0) : null},
        ${week > 1 ? Math.round(stats?.prev_views ?? 0) : null},
        ${top?.url ?? null}, ${top?.views ?? null}
      )
      ON CONFLICT (contract_id, week_number) DO NOTHING
      RETURNING id
    `) as Array<{ id: number }>
    if (rows[0]) insertedIds.push(rows[0].id)
  }

  return insertedIds.length > 0 ? selectReviews({ ids: insertedIds }) : []
}

export async function markContractReviewed(id: number) {
  await sql`UPDATE contract_reviews SET reviewed_at = NOW() WHERE id = ${id} AND reviewed_at IS NULL`
}

export async function markAllContractReviewsReviewed() {
  await sql`UPDATE contract_reviews SET reviewed_at = NOW() WHERE reviewed_at IS NULL`
}

export function contractDayLabel(review: Pick<ContractReview, 'weekEnd' | 'contractStart' | 'contractEnd'>): string {
  const day = dayNumber(review.weekEnd) - dayNumber(review.contractStart) + 1
  if (!review.contractEnd) return `day ${day}`
  const total = dayNumber(review.contractEnd) - dayNumber(review.contractStart) + 1
  return `day ${day} of ${total}`
}

export function formatContractReviewsMessage(reviews: ContractReview[], origin: string | null): string {
  const lines: string[] = [
    `📋 WEEKLY CONTRACT CHECK-IN`,
    `${reviews.length} creator${reviews.length === 1 ? '' : 's'} finished a contract week. Check their accounts and analytics.`,
  ]
  const byProject = new Map<string, ContractReview[]>()
  for (const r of reviews) {
    const key = r.projectName ?? 'No project'
    byProject.set(key, [...(byProject.get(key) ?? []), r])
  }
  for (const [project, rows] of byProject) {
    lines.push('', `— ${project} —`)
    for (const r of rows) {
      const compare =
        r.prevVideos != null
          ? ` (week before: ${r.prevVideos} videos · ${formatNumber(r.prevViews ?? 0)} views)`
          : ''
      lines.push(
        '',
        `👤 ${r.creatorName} · ${r.contractName}`,
        `Week ${r.weekNumber} (${contractDayLabel(r)}) · ${formatDate(r.weekStart)} → ${formatDate(r.weekEnd)}`,
        `🎬 ${r.videos} videos (IG ${r.instagram} · TT ${r.tiktok}) · ${formatNumber(r.views)} views${compare}`,
      )
      if (r.topUrl) lines.push(`🔥 Top: ${formatNumber(r.topViews ?? 0)} views · ${r.topUrl}`)
      for (const p of r.profiles) lines.push(`${p.label}: ${p.url}`)
      if (origin) lines.push(`Dashboard: ${origin}/admin/creators/${r.creatorId}?panel=videos&from=reviews`)
    }
  }
  return lines.join('\n')
}

/** Cron entry: record finished weeks and send one Telegram message for the new ones. */
export async function runContractReviews(
  lastCompleted: string,
  origin: string | null,
): Promise<{ created: number; telegram: { ok: boolean; skipped?: boolean; error?: string } }> {
  const fresh = await syncContractReviews(lastCompleted)
  if (fresh.length === 0) return { created: 0, telegram: { ok: true, skipped: true } }
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  if (!telegramConfigured()) return { created: fresh.length, telegram: { ok: true, skipped: true } }
  const res = await sendTelegramMessage(formatContractReviewsMessage(fresh, origin))
  return { created: fresh.length, telegram: res }
}
