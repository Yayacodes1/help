import 'server-only'
import type { Platform } from '@/lib/db'
import { isTikTokHost } from '@/lib/media-url'
import {
  INSTAGRAM_REFRESH_USER_ERROR,
  canonicalizeInstagramUrl,
  extractPostedAt,
  extractViewCount,
  parseTikHubEnvelope,
} from '@/lib/tikhub-views'

export {
  INSTAGRAM_REFRESH_USER_ERROR,
  canonicalizeInstagramUrl,
  extractInstagramCode,
  extractPostedAt,
  extractViewCount,
  publicViewsError,
} from '@/lib/tikhub-views'

const BASE = 'https://api.tikhub.io'

function getApiKey(): string {
  const key = process.env.TIKHUB_API_KEY?.trim()
  if (!key) throw new Error('TIKHUB_API_KEY is not set')
  return key
}

export function extractTikTokAwemeId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const fromPath = u.pathname.match(/\/(?:video|photo)\/(\d{5,})/)
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

class TikHubHttpError extends Error {
  status: number
  requestId?: string
  path: string

  constructor(message: string, status: number, path: string, requestId?: string) {
    super(message)
    this.name = 'TikHubHttpError'
    this.status = status
    this.path = path
    this.requestId = requestId
  }
}

function logTikHub(
  event: string,
  details: Record<string, unknown>,
) {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(details)) {
    if (/key|token|secret|authorization|bearer/i.test(k)) continue
    if (typeof v === 'string' && v.length > 240) {
      safe[k] = `${v.slice(0, 240)}…`
    } else {
      safe[k] = v
    }
  }
  console.warn(`[tikhub:${event}]`, safe)
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
    signal: AbortSignal.timeout(12_000),
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
    logTikHub('request-failed', {
      path,
      status: envelope.status,
      requestId: envelope.requestId,
      code: envelope.code,
      message: envelope.message,
    })
    throw new TikHubHttpError(
      friendlyTikHubError(envelope.status, envelope.message || body),
      envelope.status,
      path,
      envelope.requestId,
    )
  }

  return envelope.payload
}

/** Follow vt./vm./tt.site redirects to the canonical TikTok URL (no TikHub charge). */
export async function resolveMediaRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
  /** ISO timestamptz when the platform says the video went live. */
  postedAt?: string
}

export type FetchViewsErr = {
  ok: false
  reason: string
}

export type FetchViewsResult = FetchViewsOk | FetchViewsErr

function viewsFromPayload(data: unknown): number | null {
  return extractViewCount(data)
}

function metaFromPayload(
  data: unknown,
  resolvedUrl?: string,
): FetchViewsOk | null {
  const views = viewsFromPayload(data)
  if (views == null) return null
  const postedAt = extractPostedAt(data) ?? undefined
  return {
    ok: true,
    views,
    resolvedUrl,
    postedAt,
  }
}

function isShortTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    const h = host.replace(/^www\./i, '').toLowerCase()
    return (
      isTikTokHost(h) &&
      (h === 'tt.site' ||
        h.endsWith('.tt.site') ||
        h === 'vt.tiktok.com' ||
        h === 'vm.tiktok.com' ||
        !/\/(?:video|photo)\/\d{5,}/.test(new URL(url).pathname))
    )
  } catch {
    return false
  }
}

async function fetchTikTokViews(url: string): Promise<FetchViewsResult> {
  const attempts: string[] = []
  let working = url

  // Open tt.site / vt. / vm. first — TikHub often cannot read the share host itself.
  if (isShortTikTokUrl(url)) {
    const resolved = await resolveMediaRedirect(url)
    if (resolved !== url) working = resolved
  }

  let bestResolved = working

  const tryShare = async (shareUrl: string) => {
    const data = await tikhubGet(
      '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url',
      { share_url: shareUrl },
    )
    const hit = metaFromPayload(data, shareUrl)
    if (hit && hit.views > 0) return hit
    if (hit && hit.views === 0) return hit
    attempts.push('share_url: no play_count')
    return null
  }

  // 1) Resolved canonical URL, then the original paste
  for (const shareUrl of working === url ? [url] : [working, url]) {
    try {
      const hit = await tryShare(shareUrl)
      if (hit) return { ...hit, resolvedUrl: working !== url ? working : hit.resolvedUrl }
    } catch (e) {
      attempts.push(e instanceof Error ? e.message.slice(0, 80) : 'share_url failed')
    }
  }

  // 2) Follow redirect if we have not already, then retry share + id endpoints
  const resolved = working === url ? await resolveMediaRedirect(url) : working
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
      const hit = metaFromPayload(data, bestResolved)
      if (hit) return hit
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
    const hit = metaFromPayload(data, bestResolved)
    if (hit) return hit
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

function requestKey(path: string, query: Record<string, string>): string {
  const params = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&')
  return `${path}?${params}`
}

async function fetchInstagramViews(url: string): Promise<FetchViewsResult> {
  let working = canonicalizeInstagramUrl(url)
  if (!working.code) {
    const resolved = await resolveMediaRedirect(url)
    if (resolved !== url) working = canonicalizeInstagramUrl(resolved)
  }

  const failed400 = new Set<string>()

  const tryEndpoint = async (
    path: string,
    query: Record<string, string>,
  ): Promise<FetchViewsOk | 'missing'> => {
    const key = requestKey(path, query)
    if (failed400.has(key)) return 'missing'
    try {
      const data = await tikhubGet(path, query)
      const hit = metaFromPayload(data, working.url)
      if (hit) return hit
      logTikHub('instagram-missing-count', {
        path,
        requestId: undefined,
        code: working.code,
        canonicalUrl: working.url,
      })
      return 'missing'
    } catch (e) {
      if (e instanceof TikHubHttpError && e.status === 400) {
        failed400.add(key)
      }
      logTikHub('instagram-failed', {
        path,
        status: e instanceof TikHubHttpError ? e.status : undefined,
        requestId: e instanceof TikHubHttpError ? e.requestId : undefined,
        code: working.code,
        canonicalUrl: working.url,
        message: e instanceof Error ? e.message : 'failed',
      })
      throw e
    }
  }

  try {
    const hit = await tryEndpoint('/api/v1/instagram/v1/fetch_post_by_url', {
      post_url: working.url,
    })
    if (hit !== 'missing') return hit
  } catch {
    /* V2 below; diagnostics already logged */
  }

  const codeOrUrl = working.code ?? working.url
  const v2Key = requestKey('/api/v1/instagram/v2/fetch_post_info', {
    code_or_url: codeOrUrl,
  })
  if (!failed400.has(v2Key)) {
    try {
      const hit = await tryEndpoint('/api/v1/instagram/v2/fetch_post_info', {
        code_or_url: codeOrUrl,
      })
      if (hit !== 'missing') {
        return {
          ...hit,
          resolvedUrl: working.url !== url ? working.url : hit.resolvedUrl,
        }
      }
    } catch {
      /* public message below */
    }
  }

  return { ok: false, reason: INSTAGRAM_REFRESH_USER_ERROR }
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
    if (platform === 'instagram') {
      logTikHub('instagram-unhandled', {
        message: e instanceof Error ? e.message : 'unknown error',
      })
      return { ok: false, reason: INSTAGRAM_REFRESH_USER_ERROR }
    }
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
