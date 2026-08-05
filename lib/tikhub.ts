import 'server-only'
import type { Platform } from '@/lib/db'

const BASE = 'https://api.tikhub.io'

function getApiKey(): string {
  const key = process.env.TIKHUB_API_KEY?.trim()
  if (!key) throw new Error('TIKHUB_API_KEY is not set')
  return key
}

export function extractInstagramCode(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!/(^|\.)instagram\.com$/i.test(host) && !/^instagr\.am$/i.test(host)) {
      return null
    }
    const m = u.pathname.match(/\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/i)
    return m?.[2] ?? null
  } catch {
    return null
  }
}

function asFiniteCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return null
}

const VIEW_KEYS = [
  'play_count',
  'playCount',
  'view_count',
  'viewCount',
  'video_view_count',
  'videoViewCount',
  'ig_play_count',
  'plays',
  'views',
] as const

function viewsFromObject(obj: Record<string, unknown> | null | undefined): number | null {
  if (!obj) return null
  for (const k of VIEW_KEYS) {
    const n = asFiniteCount(obj[k])
    if (n != null) return n
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function firstArrayItem(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value) && value[0]) return asRecord(value[0])
  return null
}

/**
 * Prefer TikTok `statistics.play_count` / IG metric fields.
 * Avoid walking the whole tree (many unrelated `*_count: 0` fields).
 */
export function extractViewCount(payload: unknown): number | null {
  const root = asRecord(payload)
  if (!root) return null

  const data = asRecord(root.data) ?? root
  const aweme =
    asRecord(data.aweme_detail) ??
    asRecord(data.aweme) ??
    firstArrayItem(data.aweme_list) ??
    asRecord(root.aweme_detail) ??
    asRecord(root.aweme)

  const preferred: Array<Record<string, unknown> | null> = [
    asRecord(aweme?.statistics),
    asRecord(aweme?.stats),
    asRecord(data.statistics),
    asRecord(data.stats),
    asRecord(data.metrics),
    asRecord(data.video),
    asRecord(data.item),
    asRecord(data.media),
    asRecord(asRecord(data.itemInfo)?.itemStruct),
    asRecord(asRecord(asRecord(data.itemInfo)?.itemStruct)?.stats),
    aweme,
    data,
    root,
  ]

  let foundZero: number | null = null
  for (const obj of preferred) {
    const n = viewsFromObject(obj)
    if (n == null) continue
    if (n > 0) return n
    foundZero = n
  }

  return foundZero
}

function friendlyTikHubError(status: number, body: string): string {
  const lower = body.toLowerCase()
  if (
    status === 402 ||
    lower.includes('insufficient') ||
    lower.includes('balance') ||
    lower.includes('top up') ||
    lower.includes('free credit')
  ) {
    return 'TikHub insufficient balance — top up at user.tikhub.io/users/add_credit'
  }
  return `TikHub ${status}: ${body.slice(0, 160)}`
}

async function tikhubGet(path: string, query: Record<string, string>): Promise<unknown> {
  const u = new URL(path, BASE)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)

  const res = await fetch(u, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(friendlyTikHubError(res.status, body))
  }
  return res.json()
}

export type FetchViewsOk = {
  ok: true
  views: number
  resolvedUrl?: string
}

export type FetchViewsErr = {
  ok: false
  reason: string
}

export type FetchViewsResult = FetchViewsOk | FetchViewsErr

export async function fetchViewsDetailed(
  platform: Platform,
  url: string,
): Promise<FetchViewsResult> {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, reason: 'empty url' }

  try {
    if (platform === 'instagram') {
      // Docs require `post_url` (not `url`).
      const data = await tikhubGet('/api/v1/instagram/v1/fetch_post_by_url', {
        post_url: trimmed,
      })
      const views = extractViewCount(data)
      if (views == null) {
        return { ok: false, reason: 'instagram: no play/view count in TikHub response' }
      }
      return { ok: true, views }
    }

    // Share-url endpoint resolves vt./vm./t/ short links server-side.
    const data = await tikhubGet(
      '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url',
      { share_url: trimmed },
    )
    const views = extractViewCount(data)
    if (views == null) {
      return { ok: false, reason: 'tiktok: no play/view count in TikHub response' }
    }
    return { ok: true, views, resolvedUrl: trimmed }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message.slice(0, 180) : 'unknown error',
    }
  }
}

export async function fetchViewsForUrl(
  platform: Platform,
  url: string,
): Promise<number | null> {
  const r = await fetchViewsDetailed(platform, url)
  return r.ok ? r.views : null
}
