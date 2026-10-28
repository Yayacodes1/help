export type ViewsErrorCategory =
  | 'rate_limited'
  | 'invalid_url'
  | 'auth'
  | 'billing'
  | 'provider_unavailable'
  | 'metric_missing'
  | 'timeout'
  | 'unknown'

export function kindFromHttpStatus(status: number): ViewsErrorCategory {
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'billing'
  if (status === 400 || status === 422) return 'invalid_url'
  if (status === 404) return 'metric_missing'
  if (status === 408 || status === 502 || status === 503 || status === 504) {
    return 'provider_unavailable'
  }
  return 'unknown'
}

export function parseRetryAfterMs(header: string | null | undefined, now = Date.now()): number {
  if (!header || !header.trim()) return 5_000
  const trimmed = header.trim()
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.max(1_000, Math.round(seconds * 1000)))
  }
  const when = Date.parse(trimmed)
  if (!Number.isNaN(when)) {
    return Math.min(60_000, Math.max(1_000, when - now))
  }
  return 5_000
}

export function backoffMs(attempt: number, base = 1_000, cap = 20_000, random = Math.random): number {
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt))
  return Math.round(exp * (0.5 + random() * 0.5))
}

export function classifyViewsError(
  reason: string,
  status?: number | null,
): ViewsErrorCategory {
  if (status != null && Number.isFinite(status)) return kindFromHttpStatus(status)
  const text = reason.toLowerCase()
  if (/\b429\b|rate limit|too many requests/.test(text)) return 'rate_limited'
  if (/\b401\b|\b403\b|unauthorized|forbidden|api token/.test(text)) return 'auth'
  if (/\b402\b|insufficient balance|top up|payment required/.test(text)) return 'billing'
  if (/\b400\b|\b422\b|invalid url|empty url|bad request/.test(text)) return 'invalid_url'
  if (/no play|no view|metric missing|missing count/.test(text)) return 'metric_missing'
  if (/timeout|timed out|aborted|econnreset|fetch failed|network/.test(text)) {
    return 'timeout'
  }
  if (/\b502\b|\b503\b|\b504\b|provider unavailable/.test(text)) return 'provider_unavailable'
  return 'unknown'
}

export function publicViewsCategoryMessage(
  category: ViewsErrorCategory,
  platform?: string | null,
): string {
  const network = platform === 'instagram' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : 'Video'
  switch (category) {
    case 'rate_limited':
      return 'Rate limited by TikHub. Waiting, then retrying automatically.'
    case 'invalid_url':
      return `${network} URL or request was rejected (HTTP 400). The same request will not be resent.`
    case 'auth':
      return 'TikHub authentication failed. Check TIKHUB_API_KEY on this deployment.'
    case 'billing':
      return 'TikHub insufficient balance — top up at user.tikhub.io/users/add_credit'
    case 'metric_missing':
      return `${network} response had no play/view count.`
    case 'timeout':
      return 'TikHub timed out. Will retry if attempts remain.'
    case 'provider_unavailable':
      return 'TikHub is temporarily unavailable.'
    default:
      return `${network} refresh failed.`
  }
}

/** Permanent errors must not retry or fan out to extra endpoints. */
export function isFatalViewsCategory(category: ViewsErrorCategory): boolean {
  return (
    category === 'auth' ||
    category === 'billing' ||
    category === 'invalid_url' ||
    category === 'metric_missing'
  )
}

export function isRateLimitedCategory(category: ViewsErrorCategory): boolean {
  return category === 'rate_limited'
}

export function isTransientViewsCategory(category: ViewsErrorCategory): boolean {
  return category === 'timeout' || category === 'provider_unavailable'
}

export const INSTAGRAM_REFRESH_USER_ERROR =
  "Couldn't refresh Instagram views. Try again later."

export function isTransientViewsError(reason: string): boolean {
  const category = classifyViewsError(reason)
  return category === 'timeout' || category === 'provider_unavailable' || category === 'rate_limited'
}

export function publicViewsError(
  reason: string,
  platform?: string | null,
): string {
  const category = classifyViewsError(reason)
  if (category !== 'unknown') return publicViewsCategoryMessage(category, platform)
  if (
    platform === 'instagram' ||
    /instagram/i.test(reason) ||
    /Couldn['’]t refresh Instagram/i.test(reason)
  ) {
    return INSTAGRAM_REFRESH_USER_ERROR
  }
  return reason
}
