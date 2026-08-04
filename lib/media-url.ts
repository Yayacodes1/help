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

  if (
    host === 'tiktok.com' ||
    host.endsWith('.tiktok.com') ||
    host === 'vm.tiktok.com' ||
    host === 'vt.tiktok.com'
  ) {
    return 'tiktok'
  }

  return null
}

export function parseMediaLinks(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((l) => normalizeMediaUrl(l))
    .filter((l): l is string => Boolean(l))
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
    rows.push({ url, platform })
  }

  return { rows, rejected }
}
