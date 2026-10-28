export function isInstagramShareUrl(url: string): boolean {
  try {
    const path = new URL(url.trim()).pathname.toLowerCase()
    return /\/share\//.test(path)
  } catch {
    return false
  }
}

/** Real /p /reel /tv shortcode only. Share tokens are not shortcodes. */
export function extractInstagramCode(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!/(^|\.)instagram\.com$/i.test(host) && !/^instagr\.am$/i.test(host)) {
      return null
    }
    if (/\/share\//i.test(u.pathname)) return null
    const m = u.pathname.match(/\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i)
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
  if (isInstagramShareUrl(trimmed)) {
    try {
      const u = new URL(trimmed)
      u.search = ''
      u.hash = ''
      return { url: u.toString(), code: null }
    } catch {
      return { url: trimmed, code: null }
    }
  }
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

  const data = asRecord(root.data) ?? firstArrayItem(root.data) ?? root
  const inner = asRecord(data.data) ?? firstArrayItem(data.data) ?? data
  const aweme =
    asRecord(inner.aweme_detail) ??
    asRecord(data.aweme_detail) ??
    asRecord(inner.aweme_info) ??
    asRecord(data.aweme_info) ??
    asRecord(inner.aweme) ??
    asRecord(data.aweme) ??
    firstArrayItem(inner.aweme_list) ??
    firstArrayItem(data.aweme_list) ??
    asRecord(root.aweme_detail) ??
    asRecord(root.aweme)

  const item = firstArrayItem(inner.items) ?? firstArrayItem(data.items)
  const media =
    asRecord(inner.media) ??
    asRecord(data.media) ??
    asRecord(item?.media) ??
    asRecord(inner.media_or_ad) ??
    asRecord(data.media_or_ad)

  // Documented TikHub shapes first: data.statistics.play_count and aweme.statistics.
  return [
    asRecord(inner.statistics),
    asRecord(data.statistics),
    asRecord(aweme?.statistics),
    asRecord(aweme?.stats),
    asRecord(media),
    asRecord(item),
    inner,
    data,
    aweme,
    asRecord(asRecord(inner.itemInfo)?.itemStruct),
    asRecord(inner.item),
    asRecord(data.item),
    asRecord(inner.video),
    asRecord(data.video),
    asRecord(inner.xdt_shortcode_media),
    asRecord(data.xdt_shortcode_media),
    asRecord(inner.stats),
    asRecord(data.stats),
    asRecord(inner.metrics),
    asRecord(data.metrics),
    asRecord(asRecord(asRecord(inner.itemInfo)?.itemStruct)?.stats),
    asRecord(item?.statistics),
    asRecord(media?.statistics),
  ]
}

const DEEP_PLAY_KEYS = new Set([
  'play_count',
  'playCount',
  'video_play_count',
  'videoPlayCount',
  'ig_play_count',
  'video_view_count',
  'videoViewCount',
  'view_count',
  'viewCount',
])

function deepPlayCount(value: unknown, depth = 0): number | null {
  if (depth > 8 || value == null) return null
  const obj = asRecord(value)
  if (obj) {
    for (const key of DEEP_PLAY_KEYS) {
      const n = asFiniteCount(obj[key])
      if (n != null) return n
    }
    for (const child of Object.values(obj)) {
      if (child && typeof child === 'object') {
        const n = deepPlayCount(child, depth + 1)
        if (n != null) return n
      }
    }
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = deepPlayCount(item, depth + 1)
      if (n != null) return n
    }
  }
  return null
}

/**
 * Prefer TikTok `statistics.play_count` / IG metric fields.
 * Avoid walking the whole tree (many unrelated `*_count: 0` fields).
 */
export function extractViewCount(payload: unknown): number | null {
  for (const obj of preferredMediaObjects(payload)) {
    const n = viewsFromObject(obj)
    if (n != null) return n
  }
  return deepPlayCount(payload)
}

export type AwemeRecord = {
  awemeId: string | null
  views: number | null
  postedAt: string | null
}

function asAwemeRecord(value: unknown): AwemeRecord | null {
  const obj = asRecord(value)
  if (!obj) return null
  const aweme =
    asRecord(obj.aweme_detail) ??
    asRecord(obj.aweme_info) ??
    asRecord(obj.aweme) ??
    obj
  const awemeId =
    textId(aweme.aweme_id) ??
    textId(obj.aweme_id) ??
    textId(aweme.id) ??
    textId(obj.id)
  const views = extractViewCount(aweme) ?? extractViewCount(obj)
  const postedAt = extractPostedAt(aweme) ?? extractPostedAt(obj)
  if (awemeId == null && views == null) return null
  return { awemeId, views, postedAt }
}

/** Pull every video record out of a TikHub single or batch payload. */
export function extractAwemeRecords(payload: unknown): AwemeRecord[] {
  const root = asRecord(unwrapTikHubPayload(payload))
  if (!root) return []
  const data = asRecord(root.data) ?? firstArrayItem(root.data)
  const lists: unknown[] = []
  if (Array.isArray(root.data)) lists.push(...root.data)
  if (data) {
    if (Array.isArray(data.aweme_list)) lists.push(...data.aweme_list)
    if (Array.isArray(data.aweme_details)) lists.push(...data.aweme_details)
    if (Array.isArray(data.aweme_detail_list)) lists.push(...data.aweme_detail_list)
    if (asRecord(data.aweme_detail)) lists.push(data.aweme_detail)
    lists.push(data)
  }
  lists.push(root)

  const out: AwemeRecord[] = []
  const seen = new Set<string>()
  for (const item of lists) {
    const record = asAwemeRecord(item)
    if (!record) continue
    const key = record.awemeId ?? `anon:${out.length}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(record)
  }
  return out
}

function textId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value))
  }
  if (typeof value === 'string' && /^\d{5,}$/.test(value.trim())) return value.trim()
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

export function extractPayloadAwemeId(payload: unknown): string | null {
  const root = asRecord(unwrapTikHubPayload(payload))
  if (!root) return null
  const data = asRecord(root.data) ?? root
  const inner = asRecord(data.data) ?? data
  const aweme =
    asRecord(inner.aweme_detail) ??
    asRecord(data.aweme_detail) ??
    asRecord(inner.aweme_info) ??
    asRecord(data.aweme_info) ??
    asRecord(inner.aweme) ??
    asRecord(data.aweme)
  return (
    textId(aweme?.aweme_id) ??
    textId(inner.aweme_id) ??
    textId(data.aweme_id) ??
    textId(root.aweme_id)
  )
}

export function extractPayloadInstagramCode(payload: unknown): string | null {
  const root = asRecord(unwrapTikHubPayload(payload))
  if (!root) return null
  const data = asRecord(root.data) ?? root
  const inner = asRecord(data.data) ?? data
  const item = firstArrayItem(inner.items) ?? firstArrayItem(data.items)
  const media = asRecord(inner.media) ?? asRecord(data.media) ?? asRecord(item?.media)
  const code =
    textId(media?.code) ??
    textId(media?.shortcode) ??
    textId(item?.code) ??
    textId(item?.shortcode) ??
    textId(inner.code) ??
    textId(data.code)
  return code
}

export function payloadMatchesRequestedVideo(
  payload: unknown,
  requested: { awemeId?: string | null; igCode?: string | null },
): boolean {
  if (requested.awemeId) {
    const got = extractPayloadAwemeId(payload)
    if (got && got !== requested.awemeId) return false
  }
  if (requested.igCode) {
    const got = extractPayloadInstagramCode(payload)
    if (got && got.toLowerCase() !== requested.igCode.toLowerCase()) return false
  }
  return true
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
