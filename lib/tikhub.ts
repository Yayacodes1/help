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

export function extractTikTokAwemeId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const fromPath = u.pathname.match(/\/video\/(\d{5,})/)
    if (fromPath?.[1]) return fromPath[1]
    const fromQuery =
      u.searchParams.get('aweme_id') ||
      u.searchParams.get('item_id') ||
      u.searchParams.get('id')
    if (fromQuery && /^\d{5,}$/.test(fromQuery)) return fromQuery
    return null
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
  // Some IG responses nest again: data.data
  const inner = asRecord(data.data) ?? data
  const aweme =
    asRecord(inner.aweme_detail) ??
    asRecord(data.aweme_detail) ??
    asRecord(inner.aweme) ??
    asRecord(data.aweme) ??
    firstArrayItem(inner.aweme_list) ??
    firstArrayItem(data.aweme_list) ??
    asRecord(root.aweme_detail) ??
    asRecord(root.aweme)

  const preferred: Array<Record<string, unknown> | null> = [
    asRecord(aweme?.statistics),
    asRecord(aweme?.stats),
    asRecord(inner.statistics),
    asRecord(data.statistics),
    asRecord(inner.stats),
    asRecord(data.stats),
    asRecord(inner.metrics),
    asRecord(data.metrics),
    asRecord(inner.video),
    asRecord(data.video),
    asRecord(inner.item),
    asRecord(data.item),
    asRecord(inner.media),
    asRecord(data.media),
    asRecord(asRecord(inner.itemInfo)?.itemStruct),
    asRecord(asRecord(asRecord(inner.itemInfo)?.itemStruct)?.stats),
    aweme,
    inner,
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

/** Follow vt./vm. redirects to the canonical TikTok URL (no TikHub charge). */
export async function resolveMediaRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CreatorSubmissionsBot/1.0; +https://vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    })
    if (res.url && res.url !== url) return res.url
  } catch {
    // keep original
  }
  return url
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

function viewsFromPayload(data: unknown): number | null {
  return extractViewCount(data)
}

async function fetchTikTokViews(url: string): Promise<FetchViewsResult> {
  const attempts: string[] = []
  let bestResolved = url

  const tryShare = async (shareUrl: string) => {
    const data = await tikhubGet(
      '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url',
      { share_url: shareUrl },
    )
    const views = viewsFromPayload(data)
    if (views != null && views > 0) {
      return { ok: true as const, views, resolvedUrl: shareUrl }
    }
    if (views === 0) {
      return { ok: true as const, views: 0, resolvedUrl: shareUrl }
    }
    attempts.push('share_url: no play_count')
    return null
  }

  // 1) Original short / full URL
  try {
    const hit = await tryShare(url)
    if (hit) return hit
  } catch (e) {
    attempts.push(e instanceof Error ? e.message.slice(0, 80) : 'share_url failed')
  }

  // 2) Follow redirect (vt./vm.) then retry share + id endpoints
  const resolved = await resolveMediaRedirect(url)
  if (resolved !== url) bestResolved = resolved

  if (resolved !== url) {
    try {
      const hit = await tryShare(resolved)
      if (hit) return { ...hit, resolvedUrl: resolved }
    } catch (e) {
      attempts.push(
        e instanceof Error ? `resolved share: ${e.message.slice(0, 60)}` : 'resolved share failed',
      )
    }
  }

  const awemeId = extractTikTokAwemeId(resolved) ?? extractTikTokAwemeId(url)
  if (awemeId) {
    try {
      const data = await tikhubGet('/api/v1/tiktok/app/v3/fetch_one_video', {
        aweme_id: awemeId,
      })
      const views = viewsFromPayload(data)
      if (views != null) {
        return { ok: true, views, resolvedUrl: bestResolved }
      }
      attempts.push('aweme_id: no play_count')
    } catch (e) {
      attempts.push(
        e instanceof Error ? `aweme_id: ${e.message.slice(0, 60)}` : 'aweme_id failed',
      )
    }
  }

  // 3) Hybrid fallback
  try {
    const data = await tikhubGet('/api/v1/hybrid/video_data', {
      url: bestResolved,
    })
    const views = viewsFromPayload(data)
    if (views != null) {
      return { ok: true, views, resolvedUrl: bestResolved }
    }
    attempts.push('hybrid: no play_count')
  } catch (e) {
    attempts.push(
      e instanceof Error ? `hybrid: ${e.message.slice(0, 60)}` : 'hybrid failed',
    )
  }

  return {
    ok: false,
    reason: `tiktok: no play/view count (${attempts.slice(0, 3).join(' · ') || 'empty'})`.slice(
      0,
      400,
    ),
  }
}

async function fetchInstagramViews(url: string): Promise<FetchViewsResult> {
  const attempts: string[] = []

  try {
    const data = await tikhubGet('/api/v1/instagram/v1/fetch_post_by_url', {
      post_url: url,
    })
    const views = viewsFromPayload(data)
    if (views != null) return { ok: true, views }
    attempts.push('v1: no view_count')
  } catch (e) {
    attempts.push(e instanceof Error ? e.message.slice(0, 80) : 'v1 failed')
  }

  try {
    const data = await tikhubGet('/api/v1/instagram/v1/fetch_post_by_url_v2', {
      post_url: url,
    })
    const views = viewsFromPayload(data)
    if (views != null) return { ok: true, views }
    attempts.push('v2: no view_count')
  } catch (e) {
    attempts.push(e instanceof Error ? `v2: ${e.message.slice(0, 60)}` : 'v2 failed')
  }

  return {
    ok: false,
    reason: `instagram: no play/view count (${attempts.slice(0, 3).join(' · ') || 'empty'})`.slice(
      0,
      400,
    ),
  }
}

export async function fetchViewsDetailed(
  platform: Platform,
  url: string,
): Promise<FetchViewsResult> {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, reason: 'empty url' }

  try {
    if (platform === 'instagram') return await fetchInstagramViews(trimmed)
    return await fetchTikTokViews(trimmed)
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
