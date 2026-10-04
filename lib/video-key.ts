import 'server-only'
import { sql } from '@/lib/db'

/**
 * One key per video, however the link was written:
 * TikTok → `tt:<video id>`, Instagram → `ig:<post code>`, anything else → `url:<host><path>`.
 */
export function videoKeyFromUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase()
  const path = u.pathname.replace(/\/+$/, '')
  if (host.endsWith('tiktok.com')) {
    const id = path.match(/\/(?:video|photo)\/(\d{8,})/)?.[1]
    if (id) return `tt:${id}`
  }
  if (host.endsWith('instagram.com') || host === 'instagr.am') {
    const code = path.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i)?.[1]
    if (code) return `ig:${code}`
  }
  return `url:${host}${path}`
}

/** Like `videoKeyFromUrl`, but opens TikTok short links (vt./vm.) to find the real video id. */
export async function resolveVideoKey(url: string): Promise<{ key: string | null; resolvedUrl: string }> {
  const key = videoKeyFromUrl(url)
  if (key && !key.startsWith('url:')) return { key, resolvedUrl: url }
  if (/(^|\.)tiktok\.com$/i.test(safeHost(url))) {
    const { resolveMediaRedirect } = await import('@/lib/tikhub')
    const resolvedUrl = await resolveMediaRedirect(url)
    const resolvedKey = videoKeyFromUrl(resolvedUrl)
    if (resolvedKey && !resolvedKey.startsWith('url:')) return { key: resolvedKey, resolvedUrl }
  }
  return { key, resolvedUrl: url }
}

function safeHost(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
  } catch {
    return ''
  }
}

export async function ensureVideoKeyColumn() {
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS video_key text`
  await sql`CREATE INDEX IF NOT EXISTS submissions_video_key_idx ON submissions (video_key)`
}

export type ExistingVideo = {
  id: number
  video_key: string
  video_date: string
  creator_id: number
  creator_name: string
}

/** Earliest submission for each key that's already in the database. */
export async function findExistingVideos(
  keys: string[],
  opts: { excludeId?: number } = {},
): Promise<Map<string, ExistingVideo>> {
  const wanted = [...new Set(keys.filter(Boolean))]
  if (wanted.length === 0) return new Map()
  const rows = (await sql`
    SELECT DISTINCT ON (s.video_key)
      s.id, s.video_key, s.video_date::text AS video_date, s.creator_id, c.name AS creator_name
    FROM submissions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.video_key = ANY(${wanted}::text[])
      AND (${opts.excludeId ?? null}::int IS NULL OR s.id <> ${opts.excludeId ?? null})
    ORDER BY s.video_key, s.created_at ASC
  `) as ExistingVideo[]
  return new Map(rows.map((r) => [r.video_key, r]))
}
