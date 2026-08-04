import 'server-only'
import type { Platform } from '@/lib/db'

const BASE = 'https://api.datalikers.com'

function getApiKey(): string {
  const key = process.env.DATALIKERS_API_KEY?.trim()
  if (!key) throw new Error('DATALIKERS_API_KEY is not set')
  return key
}

export function extractInstagramCode(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!/(^|\.)instagram\.com$/i.test(host)) return null
    const m = u.pathname.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/i)
    return m?.[2] ?? null
  } catch {
    return null
  }
}

/** Numeric TikTok video id from a standard or short URL. */
export async function resolveTikTokVideoId(url: string): Promise<string | null> {
  const direct = url.match(/\/video\/(\d+)/)?.[1]
  if (direct) return direct

  // Short links (vm.tiktok.com, tiktok.com/t/…) need redirect resolution.
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const finalUrl = res.url || url
    return finalUrl.match(/\/video\/(\d+)/)?.[1] ?? null
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

function viewsFromObject(obj: Record<string, unknown>): number | null {
  for (const k of VIEW_KEYS) {
    const n = asFiniteCount(obj[k])
    // Prefer a positive count when both 0 and a nested real value exist —
    // still accept 0 as a valid API response.
    if (n != null) return n
  }
  return null
}

/** Pull play/view count from Instagram (Hiker-shaped) or TikTok (LamTok-shaped) payloads. */
export function extractViewCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  // Common wrappers from cache gateways
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
    throw new Error(`DataLikers ${path} ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

export async function fetchViewsForUrl(
  platform: Platform,
  url: string,
): Promise<number | null> {
  const trimmed = url.trim()
  if (!trimmed) return null

  try {
    if (platform === 'instagram') {
      const code = extractInstagramCode(trimmed)
      const data = code
        ? await datalikersGet('/v1/media/by/code', { code })
        : await datalikersGet('/v1/media/by/url', { url: trimmed })
      return extractViewCount(data)
    }

    const id = await resolveTikTokVideoId(trimmed)
    if (!id) return null
    const data = await datalikersGet('/t1/media/by/id', { id })
    return extractViewCount(data)
  } catch {
    return null
  }
}
