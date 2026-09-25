import type { Platform } from '@/lib/db'

export type LoginPlatform = Platform

/** Strip @ and whitespace from a social handle. */
export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^@+/, '')
}

export function parseOptionalHandle(value: FormDataEntryValue | null): string | null {
  const cleaned = normalizeHandle(value?.toString() ?? '')
  return cleaned ? cleaned.slice(0, 80) : null
}

export function displayHandle(value: string | null | undefined): string | null {
  const cleaned = normalizeHandle(value)
  return cleaned || null
}

export function tiktokProfileUrl(handle: string | null | undefined): string | null {
  const h = displayHandle(handle)
  return h ? `https://www.tiktok.com/@${encodeURIComponent(h)}` : null
}

export function instagramProfileUrl(handle: string | null | undefined): string | null {
  const h = displayHandle(handle)
  return h ? `https://www.instagram.com/${encodeURIComponent(h)}/` : null
}

export type BrandSocialHandles = {
  notek_tiktok_username?: string | null
  notek_instagram_username?: string | null
  miqat_tiktok_username?: string | null
  miqat_instagram_username?: string | null
}

export function parseLoginPlatform(value: unknown): LoginPlatform | null {
  const raw = typeof value === 'string' ? value : value?.toString()
  return raw === 'instagram' || raw === 'tiktok' ? raw : null
}

export type PersonLogin = {
  name?: string | null
  tiktok_username?: string | null
  instagram_username?: string | null
  login_platform?: string | null
}

export function resolveLoginPlatform(
  person: PersonLogin,
  preferred?: LoginPlatform | null,
): LoginPlatform {
  const tiktok = displayHandle(person.tiktok_username)
  const instagram = displayHandle(person.instagram_username)
  if (preferred === 'tiktok' && tiktok) return 'tiktok'
  if (preferred === 'instagram' && instagram) return 'instagram'
  const stored = parseLoginPlatform(person.login_platform)
  if (stored === 'tiktok' && tiktok) return 'tiktok'
  if (stored === 'instagram' && instagram) return 'instagram'
  if (tiktok && !instagram) return 'tiktok'
  if (instagram && !tiktok) return 'instagram'
  if (stored) return stored
  return tiktok ? 'tiktok' : 'instagram'
}

/** Handle used for login and ranking. */
export function loginHandleFor(person: PersonLogin): {
  platform: LoginPlatform
  handle: string
} {
  const platform = resolveLoginPlatform(person)
  const chosen =
    platform === 'instagram'
      ? displayHandle(person.instagram_username)
      : displayHandle(person.tiktok_username)
  const fallback =
    displayHandle(person.tiktok_username) ??
    displayHandle(person.instagram_username) ??
    displayHandle(person.name) ??
    ''
  return { platform, handle: chosen ?? fallback }
}
