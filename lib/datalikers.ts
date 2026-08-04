import 'server-only'
import type { Platform } from '@/lib/db'

const BASE = 'https://api.datalikers.com'

const TIKTOK_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function getApiKey(): string {
  const key = process.env.DATALIKERS_API_KEY?.trim()
  if (!key) throw new Error('DATALIKERS_API_KEY is not set')
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

function extractTikTokIdFromText(text: string): string | null {
  const patterns = [
    /\/video\/(\d{10,})/,
    /["']aweme_id["']\s*:\s*["']?(\d{10,})/,
    /["']video[_]?id["']\s*:\s*["']?(\d{10,})/,
    /["']itemId["']\s*:\s*["']?(\d{10,})/,
    /["']id["']\s*:\s*["'](\d{15,})["']/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * Resolve numeric TikTok video id from full or short URLs (vt / vm / t /…).
 * Tries redirects + HTML body scrape because TikTok often doesn't land on /video/{id} for bots.
 */
export async function resolveTikTokVideoId(
  url: string,
): Promise<{ id: string | null; resolvedUrl: string | null; error?: string }> {
  const direct = url.match(/\/video\/(\d{10,})/)?.[1]
  if (direct) {
    return { id: direct, resolvedUrl: url }
  }

  const attempts: { method: 'GET' | 'HEAD'; redirect: RequestRedirect }[] = [
    { method: 'GET', redirect: 'follow' },
    { method: 'GET', redirect: 'manual' },
  ]

  let lastError = 'could not resolve TikTok short link'
  for (const attempt of attempts) {
    try {
      const res = await fetch(url, {
        method: attempt.method,
        redirect: attempt.redirect,
        headers: {
          'User-Agent': TIKTOK_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })

      const location = res.headers.get('location')
      const fromLocation = location ? extractTikTokIdFromText(location) : null
      if (fromLocation) {
        return {
          id: fromLocation,
          resolvedUrl: location!.startsWith('http')
            ? location!
            : `https://www.tiktok.com/video/${fromLocation}`,
        }
      }

      const finalUrl = res.url || url
      const fromFinal = extractTikTokIdFromText(finalUrl)
      if (fromFinal) {
        return { id: fromFinal, resolvedUrl: finalUrl }
      }

      if (attempt.redirect === 'follow' && attempt.method === 'GET') {
        const text = await res.text().catch(() => '')
        const fromBody = extractTikTokIdFromText(text.slice(0, 500_000))
        if (fromBody) {
          return {
            id: fromBody,
            resolvedUrl: `https://www.tiktok.com/video/${fromBody}`,
          }
        }
        if (!res.ok) lastError = `TikTok short link HTTP ${res.status}`
        else lastError = 'TikTok page had no video id'
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'TikTok fetch failed'
    }
  }

  return { id: null, resolvedUrl: null, error: lastError }
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

function viewsFromObject(obj: Record<string, unknown>): number | null {
  for (const k of VIEW_KEYS) {
    const n = asFiniteCount(obj[k])
    if (n != null) return n
  }
  return null
}

/** Pull play/view count from Instagram (Hiker-shaped) or TikTok (LamTok-shaped) payloads. */
export function extractViewCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  const candidates: Record<string, unknown>[] = [root]
  for (const key of ['data', 'result', 'media', 'item', 'aweme_detail', 'aweme']) {
    const nested = root[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      candidates.push(nested as Record<string, unknown>)
    }
  }

  let foundZero: number | null = null
  for (const obj of candidates) {
    const direct = viewsFromObject(obj)
    if (direct != null) {
      if (direct > 0) return direct
      foundZero = direct
    }

    for (const nestedKey of ['statistics', 'stats', 'itemInfo', 'video', 'media']) {
      const nested = obj[nestedKey]
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue
      const n = viewsFromObject(nested as Record<string, unknown>)
      if (n != null) {
        if (n > 0) return n
        foundZero = n
      }

      const itemStruct = (nested as Record<string, unknown>).itemStruct
      if (itemStruct && typeof itemStruct === 'object') {
        const stats = (itemStruct as Record<string, unknown>).stats
        if (stats && typeof stats === 'object') {
          const sn = viewsFromObject(stats as Record<string, unknown>)
          if (sn != null) {
            if (sn > 0) return sn
            foundZero = sn
          }
        }
      }
    }
  }

  return foundZero
}

async function datalikersGet(path: string, query: Record<string, string>): Promise<unknown> {
  const key = getApiKey()
  const u = new URL(path, BASE)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
  u.searchParams.set('access_key', key)

  const res = await fetch(u, {
    headers: { 'x-access-key': key, Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DataLikers ${path} ${res.status}: ${body.slice(0, 180)}`)
  }
  return res.json()
}

export type FetchViewsOk = {
  ok: true
  views: number
  /** Canonical URL when a short link was expanded */
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
      const code = extractInstagramCode(trimmed)
      if (!code) {
        return { ok: false, reason: 'instagram: could not parse reel/post code' }
      }
      const data = await datalikersGet('/v1/media/by/code', { code })
      const views = extractViewCount(data)
      if (views == null) {
        return { ok: false, reason: 'instagram: no play/view count in API response' }
      }
      return { ok: true, views }
    }

    const resolved = await resolveTikTokVideoId(trimmed)
    if (!resolved.id) {
      return {
        ok: false,
        reason: `tiktok: ${resolved.error ?? 'could not resolve video id'}`,
      }
    }
    const data = await datalikersGet('/t1/media/by/id', { id: resolved.id })
    const views = extractViewCount(data)
    if (views == null) {
      return { ok: false, reason: 'tiktok: no play/view count in API response' }
    }
    return {
      ok: true,
      views,
      resolvedUrl: resolved.resolvedUrl ?? undefined,
    }
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message.slice(0, 180) : 'unknown error',
    }
  }
}

/** @deprecated Prefer fetchViewsDetailed */
export async function fetchViewsForUrl(
  platform: Platform,
  url: string,
): Promise<number | null> {
  const r = await fetchViewsDetailed(platform, url)
  return r.ok ? r.views : null
}
