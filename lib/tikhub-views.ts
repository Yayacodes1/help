export const INSTAGRAM_REFRESH_USER_ERROR =
  "Couldn't refresh Instagram views. Try again later."

export function isTransientViewsError(reason: string): boolean {
  return /\b(429|502|503|504|timeout|timed out|rate limit|econnreset|fetch failed|network|aborted)\b/i.test(
    reason,
  )
}

export function publicViewsError(
  reason: string,
  platform?: string | null,
): string {
  if (
    platform === 'instagram' ||
    /instagram/i.test(reason) ||
    /Couldn['’]t refresh Instagram/i.test(reason)
  ) {
    return INSTAGRAM_REFRESH_USER_ERROR
  }
  return reason
}

export function extractInstagramCode(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!/(^|\.)instagram\.com$/i.test(host) && !/^instagr\.am$/i.test(host)) {
      return null
    }
    const m = u.pathname.match(
      /\/(?:share\/(?:reels?|p)|reels?|p|tv)\/([A-Za-z0-9_-]+)/i,
    )
    return m?.[1] ?? null
  } catch {
    return null
  }
}

function instagramPathKind(url: string): 'p' | 'reel' | 'tv' {
  try {
    const path = new URL(url.trim()).pathname.toLowerCase()
    if (/\/(?:share\/)?p\//.test(path)) return 'p'
    if (/\/tv\//.test(path)) return 'tv'
  } catch {
    /* default reel */
  }
  return 'reel'
}

/** Strip tracking query params and normalize to a canonical IG post URL. */
export function canonicalizeInstagramUrl(raw: string): {
  url: string
  code: string | null
} {
  const trimmed = raw.trim()
  const code = extractInstagramCode(trimmed)
  if (code) {
    const kind = instagramPathKind(trimmed)
    return { url: `https://www.instagram.com/${kind}/${code}/`, code }
  }
  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'instagram.com' || host === 'instagr.am') {
      u.protocol = 'https:'
      u.hostname = 'www.instagram.com'
      u.search = ''
      u.hash = ''
      return { url: u.toString(), code: null }
    }
  } catch {
    /* keep original */
  }
  return { url: trimmed, code: null }
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
  'video_play_count',
  'videoPlayCount',
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

export function unwrapTikHubPayload(payload: unknown): unknown {
  const root = asRecord(payload)
  if (!root) return payload
  let data: unknown = root.data
  if (typeof data === 'string' && data.trim()) {
    try {
      data = JSON.parse(data)
    } catch {
      /* keep string */
    }
  }
  if (data && typeof data === 'object') {
    return { ...root, data }
  }
  return payload
}

function isTikHubFailCode(code: unknown): boolean {
  if (code == null) return false
  if (code === 0 || code === 200 || code === '0' || code === 'OK' || code === 'ok') {
    return false
  }
  if (typeof code === 'number' && code >= 400) return true
  if (typeof code === 'string' && /^(400|401|403|404|429|500)/.test(code)) return true
  return false
}

export type TikHubEnvelopeOk = {
  ok: true
  payload: unknown
  requestId?: string
}

export type TikHubEnvelopeErr = {
  ok: false
  status: number
  message: string
  requestId?: string
  code?: unknown
}

export type TikHubEnvelope = TikHubEnvelopeOk | TikHubEnvelopeErr

function requestIdFrom(payload: unknown, extra?: string | null): string | undefined {
  const root = asRecord(payload)
  const id =
    (typeof root?.request_id === 'string' && root.request_id) ||
    (typeof root?.requestId === 'string' && root.requestId) ||
    extra ||
    undefined
  return id || undefined
}

/** Treat HTTP errors and TikHub `{ code: 400 }` JSON as a failed request, not a missing count. */
export function parseTikHubEnvelope(
  payload: unknown,
  httpStatus = 200,
  requestIdHeader?: string | null,
): TikHubEnvelope {
  const requestId = requestIdFrom(payload, requestIdHeader)
  if (httpStatus < 200 || httpStatus >= 300) {
    const root = asRecord(payload)
    const message =
      (typeof root?.message === 'string' && root.message) ||
      (typeof root?.detail === 'string' && root.detail) ||
      `HTTP ${httpStatus}`
    return {
      ok: false,
      status: httpStatus,
      message,
      requestId,
      code: root?.code,
    }
  }

  const unwrapped = unwrapTikHubPayload(payload)
  const root = asRecord(unwrapped)
  if (root && isTikHubFailCode(root.code)) {
    const status =
      typeof root.code === 'number' ? root.code : Number(root.code) || 400
    const message =
      (typeof root.message === 'string' && root.message) || `TikHub code ${String(root.code)}`
    return {
      ok: false,
      status,
      message,
      requestId,
      code: root.code,
    }
  }

  return { ok: true, payload: unwrapped, requestId }
}

function preferredMediaObjects(payload: unknown): Array<Record<string, unknown> | null> {
  const root = asRecord(unwrapTikHubPayload(payload))
  if (!root) return []

  const data = asRecord(root.data) ?? root
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

  return [
    aweme,
    asRecord(asRecord(inner.itemInfo)?.itemStruct),
    asRecord(inner.item),
    asRecord(data.item),
    asRecord(inner.media),
    asRecord(data.media),
    asRecord(inner.video),
    asRecord(data.video),
    asRecord(inner.caption),
    asRecord(data.caption),
    firstArrayItem(inner.items),
    firstArrayItem(data.items),
    asRecord(inner.xdt_shortcode_media),
    asRecord(data.xdt_shortcode_media),
    asRecord(aweme?.statistics),
    asRecord(aweme?.stats),
    asRecord(inner.statistics),
    asRecord(data.statistics),
    asRecord(inner.stats),
    asRecord(data.stats),
    asRecord(inner.metrics),
    asRecord(data.metrics),
    asRecord(asRecord(asRecord(inner.itemInfo)?.itemStruct)?.stats),
    inner,
    data,
    root,
  ]
}

/**
 * Prefer TikTok `statistics.play_count` / IG metric fields.
 * Avoid walking the whole tree (many unrelated `*_count: 0` fields).
 */
export function extractViewCount(payload: unknown): number | null {
  let foundZero: number | null = null
  for (const obj of preferredMediaObjects(payload)) {
    const n = viewsFromObject(obj)
    if (n == null) continue
    if (n > 0) return n
    foundZero = n
  }

  return foundZero
}

const POSTED_AT_KEYS = [
  'create_time',
  'createTime',
  'create_timestamp',
  'createTimestamp',
  'taken_at',
  'takenAt',
  'taken_at_timestamp',
  'takenAtTimestamp',
  'device_timestamp',
  'deviceTimestamp',
  'publish_time',
  'publishTime',
  'posted_at',
  'postedAt',
  'timestamp',
] as const

function isoFromUnknownTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const trimmed = value.trim()
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return isoFromUnknownTime(Number(trimmed))
    }
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

function postedAtFromObject(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null
  for (const k of POSTED_AT_KEYS) {
    const iso = isoFromUnknownTime(obj[k])
    if (iso) return iso
  }
  return null
}

export function extractPostedAt(payload: unknown): string | null {
  for (const obj of preferredMediaObjects(payload)) {
    const iso = postedAtFromObject(obj)
    if (iso) return iso
  }
  return null
}
