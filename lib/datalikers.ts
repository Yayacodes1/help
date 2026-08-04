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

/** Pull play/view count from Instagram (Hiker-shaped) or TikTok (LamTok-shaped) payloads. */
export function extractViewCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>

  const topKeys = [
    'play_count',
    'playCount',
    'view_count',
    'viewCount',
    'video_view_count',
    'videoViewCount',
    'ig_play_count',
    'plays',
    'views',
  ]
  for (const k of topKeys) {
    const n = asFiniteCount(obj[k])
    if (n != null) return n
  }

  const nestedRoots = [obj.statistics, obj.stats, obj.itemInfo, obj.video, obj.media]
  for (const root of nestedRoots) {
    if (!root || typeof root !== 'object') continue
    const nested = root as Record<string, unknown>
    for (const k of topKeys) {
      const n = asFiniteCount(nested[k])
      if (n != null) return n
    }
    // TikTok often: itemInfo.itemStruct.stats.playCount
    const itemStruct = nested.itemStruct
    if (itemStruct && typeof itemStruct === 'object') {
      const stats = (itemStruct as Record<string, unknown>).stats
      if (stats && typeof stats === 'object') {
        for (const k of ['playCount', 'play_count', 'viewCount', 'view_count']) {
          const n = asFiniteCount((stats as Record<string, unknown>)[k])
          if (n != null) return n
        }
      }
    }
  }

  return null
}

async function datalikersGet(path: string, query: Record<string, string>): Promise<unknown> {
  const u = new URL(path, BASE)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)

  const res = await fetch(u, {
    headers: { 'x-access-key': getApiKey(), Accept: 'application/json' },
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
