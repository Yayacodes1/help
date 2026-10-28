import 'server-only'
import type { Platform } from '@/lib/db'
import {
  extractTikTokAwemeId,
  isTikTokShareLink,
} from '@/lib/media-url'
import {
  canonicalizeInstagramUrl,
  extractAwemeRecords,
  extractPayloadAwemeId,
  extractPayloadInstagramCode,
  extractPostedAt,
  extractViewCount,
  parseTikHubEnvelope,
  payloadMatchesRequestedVideo,
} from '@/lib/tikhub-views'
import {
  classifyViewsError,
  kindFromHttpStatus,
  parseRetryAfterMs,
  publicViewsCategoryMessage,
  type ViewsErrorCategory,
} from '@/lib/tikhub-errors'
import { acquireTikHubQuota, blockTikHubQuota, releaseTikHubQuota } from '@/lib/tikhub-quota'
import {
  INSTAGRAM_V1_PATH,
  INSTAGRAM_V2_PATH,
  TIKTOK_AWEME_PATH,
  TIKTOK_MULTI_PATH,
  TIKTOK_SHARE_PATH,
  shouldFallbackToNextEndpoint,
  tikTokEndpointPlan,
} from '@/lib/tikhub-policy'

export {
  canonicalizeInstagramUrl,
  extractInstagramCode,
  extractPostedAt,
  extractViewCount,
} from '@/lib/tikhub-views'

export { extractTikTokAwemeId } from '@/lib/media-url'

export {
  INSTAGRAM_REFRESH_USER_ERROR,
  publicViewsError,
} from '@/lib/tikhub-errors'

const BASE = 'https://api.tikhub.io'

function getApiKey(): string {
  let key = process.env.TIKHUB_API_KEY?.trim() ?? ''
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  if (!key) throw new Error('TIKHUB_API_KEY is not set')
  return key
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
  category: ViewsErrorCategory
  retryAfterMs?: number

  constructor(
    message: string,
    status: number,
    path: string,
    requestId?: string,
    retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'TikHubHttpError'
    this.status = status
    this.path = path
    this.requestId = requestId
    this.category = kindFromHttpStatus(status)
    this.retryAfterMs = retryAfterMs
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

async function tikhubSend(
  path: string,
  init: { query?: Record<string, string>; json?: unknown },
): Promise<unknown> {
  const gate = await acquireTikHubQuota()
  if (!gate.ok) {
    throw new TikHubHttpError(
      `TikHub 429: rate limit`,
      429,
      path,
      undefined,
      gate.retryAfterMs,
    )
  }

  const u = new URL(path, BASE)
  for (const [k, v] of Object.entries(init.query ?? {})) u.searchParams.set(k, v)
  const started = Date.now()

  try {
    const res = await fetch(u, {
      method: init.json === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        Accept: 'application/json',
        ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
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
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'))

    if (!envelope.ok) {
      logTikHub('request-failed', {
        path,
        status: envelope.status,
        requestId: envelope.requestId,
        code: envelope.code,
        message: envelope.message,
        latencyMs: Date.now() - started,
      })
      if (envelope.status === 429) {
        await blockTikHubQuota(retryAfterMs)
      }
      throw new TikHubHttpError(
        friendlyTikHubError(envelope.status, envelope.message || body),
        envelope.status,
        path,
        envelope.requestId,
        envelope.status === 429 ? retryAfterMs : undefined,
      )
    }

    return envelope.payload
  } finally {
    releaseTikHubQuota()
  }
}

async function tikhubGet(path: string, query: Record<string, string>): Promise<unknown> {
  return tikhubSend(path, { query })
}

async function tikhubPost(path: string, json: unknown): Promise<unknown> {
  return tikhubSend(path, { json })
}

/** Follow vt./vm./tt.site redirects to the canonical TikTok URL (no TikHub charge). */
export async function resolveMediaRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
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
  category: ViewsErrorCategory
  retryAfterMs?: number
  status?: number
}

export type FetchViewsResult = FetchViewsOk | FetchViewsErr

function viewsFromPayload(data: unknown): number | null {
  return extractViewCount(data)
}

function metaFromPayload(
  data: unknown,
  resolvedUrl?: string,
  expected?: { awemeId?: string | null; igCode?: string | null },
): FetchViewsOk | null {
  if (expected && !payloadMatchesRequestedVideo(data, expected)) {
    logTikHub('id-mismatch', {
      expectedAwemeId: expected.awemeId ?? null,
      expectedIgCode: expected.igCode ?? null,
      payloadAwemeId: extractPayloadAwemeId(data),
      payloadIgCode: extractPayloadInstagramCode(data),
    })
    return null
  }
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

function failViews(
  reason: string,
  platform: Platform | null,
  extra: { category?: ViewsErrorCategory; retryAfterMs?: number; status?: number } = {},
): FetchViewsErr {
  const category = extra.category ?? classifyViewsError(reason, extra.status)
  return {
    ok: false,
    reason: publicViewsCategoryMessage(category, platform),
    category,
    retryAfterMs: extra.retryAfterMs,
    status: extra.status,
  }
}

function errorFromCaught(e: unknown, platform: Platform): FetchViewsErr {
  if (e instanceof TikHubHttpError) {
    logTikHub('caught', {
      path: e.path,
      status: e.status,
      requestId: e.requestId,
      category: e.category,
      message: e.message,
    })
    return failViews(e.message, platform, {
      category: e.category,
      retryAfterMs: e.retryAfterMs,
      status: e.status,
    })
  }
  const message = e instanceof Error ? e.message : 'unknown error'
  const category = classifyViewsError(message)
  logTikHub('caught', { message, category, platform })
  return failViews(message, platform, { category })
}

async function fetchTikTokViews(url: string): Promise<FetchViewsResult> {
  const original = url.trim()
  const shareLink = isTikTokShareLink(original)
  let awemeId = extractTikTokAwemeId(original)
  let resolved = original
  if (!awemeId) {
    resolved = await resolveMediaRedirect(original)
    awemeId = extractTikTokAwemeId(resolved)
  }

  const expected = { awemeId }
  const plan = tikTokEndpointPlan(awemeId, shareLink)
  logTikHub('tiktok-plan', {
    shareLink,
    hasAwemeId: Boolean(awemeId),
    plan,
  })

  if (plan.length === 0) {
    return failViews('tiktok: no play/view count', 'tiktok', { category: 'invalid_url' })
  }

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]
    try {
      const data =
        step === 'aweme_id' && awemeId
          ? await tikhubGet(TIKTOK_AWEME_PATH, { aweme_id: awemeId })
          : await tikhubGet(TIKTOK_SHARE_PATH, { share_url: original })
      const hit = metaFromPayload(data, resolved, expected)
      if (hit) {
        return { ...hit, resolvedUrl: resolved !== original ? resolved : hit.resolvedUrl }
      }
      logTikHub('tiktok-missing-count', { endpoint: step, hasAwemeId: Boolean(awemeId) })
    } catch (e) {
      const failed = errorFromCaught(e, 'tiktok')
      if (i === plan.length - 1 || !shouldFallbackToNextEndpoint(failed.category)) {
        return failed
      }
    }
  }

  return failViews('tiktok: no play/view count', 'tiktok', { category: 'metric_missing' })
}

const MULTI_CHUNK = 25

/** One TikHub request for many TikTok IDs so a page does not 429. */
export async function fetchTikTokViewsByAwemeIds(
  awemeIds: string[],
): Promise<Map<string, FetchViewsResult>> {
  const unique = [...new Set(awemeIds.filter((id) => /^\d{5,}$/.test(id)))]
  const out = new Map<string, FetchViewsResult>()
  if (unique.length === 0) return out

  for (let i = 0; i < unique.length; i += MULTI_CHUNK) {
    const chunk = unique.slice(i, i + MULTI_CHUNK)
    try {
      let data: unknown
      try {
        data = await tikhubPost(TIKTOK_MULTI_PATH, { aweme_ids: chunk })
      } catch (e) {
        if (e instanceof TikHubHttpError && (e.status === 400 || e.status === 422)) {
          data = await tikhubPost(TIKTOK_MULTI_PATH, chunk)
        } else {
          throw e
        }
      }
      const records = extractAwemeRecords(data)
      for (const record of records) {
        if (!record.awemeId || record.views == null) continue
        out.set(record.awemeId, {
          ok: true,
          views: record.views,
          postedAt: record.postedAt ?? undefined,
        })
      }
    } catch (e) {
      const failed = errorFromCaught(e, 'tiktok')
      for (const id of chunk) {
        if (!out.has(id)) out.set(id, failed)
      }
      if (failed.category === 'auth' || failed.category === 'billing') {
        for (const rest of unique.slice(i + MULTI_CHUNK)) {
          if (!out.has(rest)) out.set(rest, failed)
        }
        break
      }
    }
  }

  return out
}

async function fetchInstagramViews(url: string): Promise<FetchViewsResult> {
  const original = url.trim()
  let working = canonicalizeInstagramUrl(original)
  if (!working.code) {
    const resolved = await resolveMediaRedirect(original)
    if (resolved !== original) working = canonicalizeInstagramUrl(resolved)
  }

  const postUrl = working.code ? working.url : original
  const expected = { igCode: working.code }
  logTikHub('instagram-plan', {
    hasShortcode: Boolean(working.code),
    usedOriginalShareUrl: !working.code,
  })

  const tryV1 = async (): Promise<FetchViewsOk | 'missing'> => {
    const data = await tikhubGet(INSTAGRAM_V1_PATH, { post_url: postUrl })
    const hit = metaFromPayload(data, working.url, expected)
    if (!hit) {
      logTikHub('instagram-missing-count', {
        path: INSTAGRAM_V1_PATH,
        code: working.code,
        canonicalUrl: working.url,
      })
    }
    return hit ?? 'missing'
  }

  const tryV2 = async (): Promise<FetchViewsOk | 'missing'> => {
    const data = await tikhubGet(INSTAGRAM_V2_PATH, {
      code_or_url: working.code ?? postUrl,
    })
    const hit = metaFromPayload(data, working.url, expected)
    if (!hit) {
      logTikHub('instagram-missing-count', {
        path: INSTAGRAM_V2_PATH,
        code: working.code,
        canonicalUrl: working.url,
      })
    }
    return hit ?? 'missing'
  }

  try {
    const hit = await tryV1()
    if (hit !== 'missing') return hit
  } catch (e) {
    const failed = errorFromCaught(e, 'instagram')
    if (!shouldFallbackToNextEndpoint(failed.category)) return failed
  }

  try {
    const hit = await tryV2()
    if (hit !== 'missing') {
      return {
        ...hit,
        resolvedUrl: working.url !== original ? working.url : hit.resolvedUrl,
      }
    }
  } catch (e) {
    return errorFromCaught(e, 'instagram')
  }

  return failViews('instagram: no play/view count', 'instagram', { category: 'metric_missing' })
}

export async function fetchViewsDetailed(
  platform: Platform,
  url: string,
): Promise<FetchViewsResult> {
  const trimmed = url.trim()
  if (!trimmed) return failViews('empty url', platform, { category: 'invalid_url' })

  try {
    if (platform === 'instagram') return await fetchInstagramViews(trimmed)
    return await fetchTikTokViews(trimmed)
  } catch (e) {
    return errorFromCaught(e, platform)
  }
}

export async function fetchViewsForUrl(
  platform: Platform,
  url: string,
): Promise<number | null> {
  const r = await fetchViewsDetailed(platform, url)
  return r.ok ? r.views : null
}
