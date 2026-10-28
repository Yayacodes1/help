import type { Platform } from '@/lib/db'

export function normalizeMediaUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return `https://${value}`
  return value
}

/**
 * Infer Instagram vs TikTok from the URL host/path.
 * Returns null when the link is not a recognizable IG/TT video URL.
 */
/** TikTok’s own domains plus the newer share host `tt.site` (replaces vt.tiktok.com). */
export function isTikTokHost(host: string): boolean {
  const h = host.replace(/^www\./i, '').toLowerCase()
  return h === 'tiktok.com' || h.endsWith('.tiktok.com') || h === 'tt.site' || h.endsWith('.tt.site')
}

/** Documented share hosts/paths — not a canonical /@user/video/{id} URL. */
export function isTikTokShareLink(url: string): boolean {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (!isTikTokHost(host)) return false
    if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') return true
    if (host === 'tt.site' || host.endsWith('.tt.site')) return true
    return /^\/t\//i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Only /video/{id}, /photo/{id}, or aweme_id/item_id query params.
 * Generic `id=` on a share URL is not an aweme id and 400s TikHub.
 */
export function extractTikTokAwemeId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const fromPath = u.pathname.match(/\/(?:video|photo)\/(\d{5,})/)
    if (fromPath?.[1]) return fromPath[1]
    const fromQuery = u.searchParams.get('aweme_id') || u.searchParams.get('item_id')
    if (fromQuery && /^\d{5,}$/.test(fromQuery)) return fromQuery
    return null
  } catch {
    return null
  }
}

export function detectPlatformFromUrl(url: string): Platform | null {
  let parsed: URL
  try {
    parsed = new URL(normalizeMediaUrl(url) ?? '')
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()

  if (
    host === 'instagram.com' ||
    host.endsWith('.instagram.com') ||
    host === 'instagr.am'
  ) {
    return 'instagram'
  }

  if (isTikTokHost(host)) {
    return 'tiktok'
  }

  return null
}

/** Zero-width and bidi marks that phones (especially in Arabic) put around copied links. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

function looksLikeLink(token: string): boolean {
  return /:\/\//.test(token) || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i.test(token)
}

/**
 * Pulls links out of whatever was pasted: share text around them, Arabic commas,
 * invisible marks, or two links stuck together with no space. Plain words are ignored.
 */
export function parseMediaLinks(raw: string): string[] {
  return raw
    .replace(INVISIBLE, ' ')
    .replace(/(?=https?:\/\/)/gi, ' ')
    .split(/[\s,،؛]+/)
    .map((token) => token.replace(/^[^a-z0-9]+/i, '').replace(/[)\]}>"'.،؛!?]+$/, ''))
    .filter(looksLikeLink)
    .map((l) => normalizeMediaUrl(l))
    .filter((l): l is string => Boolean(l))
}

function hasVideoPath(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, '').length > 1
  } catch {
    return false
  }
}

export type ClassifiedLink =
  | { ok: true; url: string; platform: Platform }
  | { ok: false; url: string; error: string }

export function classifyMediaLinks(raw: string): {
  rows: { url: string; platform: Platform }[]
  rejected: { url: string; error: string }[]
} {
  const links = parseMediaLinks(raw)
  const rows: { url: string; platform: Platform }[] = []
  const rejected: { url: string; error: string }[] = []

  for (const url of links) {
    const platform = detectPlatformFromUrl(url)
    if (!platform) {
      rejected.push({
        url,
        error: 'Not an Instagram or TikTok link',
      })
      continue
    }
    if (!hasVideoPath(url)) {
      rejected.push({ url, error: 'Not a video link' })
      continue
    }
    rows.push({ url, platform })
  }

  return { rows, rejected }
}
