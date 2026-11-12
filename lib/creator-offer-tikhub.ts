import 'server-only'
import { acquireTikHubQuota, blockTikHubQuota, releaseTikHubQuota } from '@/lib/tikhub-quota'
import { parseRetryAfterMs } from '@/lib/tikhub-errors'
import { extractViewCount, parseTikHubEnvelope } from '@/lib/tikhub-views'

const BASE = 'https://api.tikhub.io'
export const OFFER_RECENT_VIDEO_LIMIT = 10

const TIKTOK_USER_POSTS = '/api/v1/tiktok/app/v3/fetch_user_post_videos'
const TIKTOK_USER_PROFILE = '/api/v1/tiktok/app/v3/handler_user_profile'
const IG_USER_REELS = '/api/v1/instagram/v2/fetch_user_reels'
const IG_USER_INFO = '/api/v1/instagram/v2/fetch_user_info'

export type OfferProfileStats = {
  ok: true
  platform: 'tiktok' | 'instagram'
  username: string
  views: number[]
  avgViews: number
  medianViews: number
  videoCount: number
  followers: number | null
  likes: number | null
  source: 'tikhub'
}

export type OfferProfileStatsErr = {
  ok: false
  error: string
}

function getApiKey(): string | null {
  let key = process.env.TIKHUB_API_KEY?.trim() ?? ''
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  return key || null
}

async function tikhubGet(path: string, query: Record<string, string>): Promise<unknown> {
  const key = getApiKey()
  if (!key) throw new Error('TIKHUB_API_KEY is not set')

  const gate = await acquireTikHubQuota()
  if (!gate.ok) {
    const err = new Error('TikHub rate limited') as Error & { status?: number }
    err.status = 429
    throw err
  }

  const u = new URL(path, BASE)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)

  try {
    const res = await fetch(u, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const body = await res.text().catch(() => '')
    let json: unknown = null
    if (body) {
      try {
        json = JSON.parse(body)
      } catch {
        json = null
      }
    }
    const envelope = parseTikHubEnvelope(
      json ?? { message: body.slice(0, 200) },
      res.status,
      res.headers.get('x-request-id'),
    )
    if (!envelope.ok) {
      if (envelope.status === 429) {
        await blockTikHubQuota(parseRetryAfterMs(res.headers.get('retry-after')))
      }
      throw new Error(envelope.message || `TikHub ${envelope.status}`)
    }
    return envelope.payload
  } finally {
    releaseTikHubQuota()
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asFiniteCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''))
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return null
}

function collectArrays(root: unknown, depth = 0): unknown[][] {
  if (depth > 6 || root == null) return []
  if (Array.isArray(root)) return [root]
  const obj = asRecord(root)
  if (!obj) return []
  const out: unknown[][] = []
  for (const key of [
    'aweme_list',
    'itemList',
    'items',
    'videos',
    'data',
    'awemeList',
  ]) {
    const v = obj[key]
    if (Array.isArray(v)) out.push(v)
    else if (v && typeof v === 'object') out.push(...collectArrays(v, depth + 1))
  }
  return out
}

function viewsFromItem(item: unknown): number | null {
  const fromExtract = extractViewCount(item)
  if (fromExtract != null && fromExtract > 0) return fromExtract
  const obj = asRecord(item)
  if (!obj) return null
  for (const key of [
    'play_count',
    'playCount',
    'view_count',
    'viewCount',
    'video_play_count',
    'videoPlayCount',
    'ig_play_count',
    'plays',
    'views',
  ]) {
    const n = asFiniteCount(obj[key])
    if (n != null) return n
  }
  const stats = asRecord(obj.statistics) ?? asRecord(obj.stats)
  if (stats) {
    for (const key of ['play_count', 'playCount', 'view_count', 'viewCount', 'views']) {
      const n = asFiniteCount(stats[key])
      if (n != null) return n
    }
  }
  return null
}

function extractViewList(payload: unknown, limit: number): number[] {
  const arrays = collectArrays(payload)
  const views: number[] = []
  for (const arr of arrays) {
    for (const item of arr) {
      const v = viewsFromItem(item)
      if (v != null && v >= 0) views.push(v)
      if (views.length >= limit) return views.slice(0, limit)
    }
  }
  return views.slice(0, limit)
}

function averageOf(values: number[]): number {
  return Math.round(values.reduce((s, n) => s + n, 0) / values.length)
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function pickProfileCounts(payload: unknown): {
  followers: number | null
  likes: number | null
} {
  const root = asRecord(payload)
  const candidates = [
    root,
    asRecord(root?.data),
    asRecord(asRecord(root?.data)?.user),
    asRecord(asRecord(root?.data)?.user_info),
    asRecord(root?.user),
    asRecord(asRecord(root?.user)?.author),
  ].filter(Boolean) as Record<string, unknown>[]

  let followers: number | null = null
  let likes: number | null = null
  for (const obj of candidates) {
    followers =
      followers ??
      asFiniteCount(obj.follower_count) ??
      asFiniteCount(obj.followerCount) ??
      asFiniteCount(obj.followers) ??
      asFiniteCount(obj.edge_followed_by) ??
      asFiniteCount(asRecord(obj.edge_followed_by)?.count)
    likes =
      likes ??
      asFiniteCount(obj.total_favorited) ??
      asFiniteCount(obj.totalFavorited) ??
      asFiniteCount(obj.heart_count) ??
      asFiniteCount(obj.likes) ??
      asFiniteCount(obj.like_count)
  }
  return { followers, likes }
}

async function fetchTikTokStats(
  username: string,
  limit: number,
): Promise<OfferProfileStats | OfferProfileStatsErr> {
  const uniqueId = username.replace(/^@+/, '')
  const [posts, profile] = await Promise.all([
    tikhubGet(TIKTOK_USER_POSTS, {
      unique_id: uniqueId,
      max_cursor: '0',
      count: String(limit),
      sort_type: '0',
    }),
    tikhubGet(TIKTOK_USER_PROFILE, { unique_id: uniqueId }).catch(() => null),
  ])
  const views = extractViewList(posts, limit)
  if (views.length === 0) {
    return {
      ok: false,
      error: 'TikHub found that TikTok account but couldn’t read recent video views. Try again shortly.',
    }
  }
  const profileCounts = pickProfileCounts(profile ?? posts)
  return {
    ok: true,
    platform: 'tiktok',
    username: uniqueId,
    views,
    avgViews: averageOf(views),
    medianViews: medianOf(views),
    videoCount: views.length,
    followers: profileCounts.followers,
    likes: profileCounts.likes,
    source: 'tikhub',
  }
}

async function fetchInstagramStats(
  username: string,
  limit: number,
): Promise<OfferProfileStats | OfferProfileStatsErr> {
  const uniqueId = username.replace(/^@+/, '')
  const [reels, info] = await Promise.all([
    tikhubGet(IG_USER_REELS, { username: uniqueId }),
    tikhubGet(IG_USER_INFO, { username: uniqueId }).catch(() => null),
  ])
  const views = extractViewList(reels, limit)
  if (views.length === 0) {
    return {
      ok: false,
      error:
        'TikHub found that Instagram account but couldn’t read recent Reel views. Try a TikTok link or upload analytics with views visible.',
    }
  }
  const profileCounts = pickProfileCounts(info ?? reels)
  return {
    ok: true,
    platform: 'instagram',
    username: uniqueId,
    views,
    avgViews: averageOf(views),
    medianViews: medianOf(views),
    videoCount: views.length,
    followers: profileCounts.followers,
    likes: profileCounts.likes,
    source: 'tikhub',
  }
}

/** Pull last N public posts/reels via TikHub and compute avg + median views. */
export async function fetchOfferProfileStats(input: {
  platform: 'tiktok' | 'instagram' | 'unknown'
  username: string | null
  limit?: number
}): Promise<OfferProfileStats | OfferProfileStatsErr> {
  if (!getApiKey()) {
    return { ok: false, error: 'View lookup is unavailable right now (TikHub not configured).' }
  }
  const username = (input.username ?? '').replace(/^@+/, '').trim()
  if (!username) {
    return { ok: false, error: 'Couldn’t read a username from that profile link.' }
  }
  const limit = Math.min(20, Math.max(1, input.limit ?? OFFER_RECENT_VIDEO_LIMIT))
  try {
    if (input.platform === 'instagram') return await fetchInstagramStats(username, limit)
    if (input.platform === 'tiktok') return await fetchTikTokStats(username, limit)
    // Unknown host — try TikTok then Instagram.
    const tt = await fetchTikTokStats(username, limit)
    if (tt.ok) return tt
    return await fetchInstagramStats(username, limit)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TikHub request failed'
    return {
      ok: false,
      error: `Couldn’t load recent videos from that link (${message.slice(0, 120)}).`,
    }
  }
}
