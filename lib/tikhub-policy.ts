import type { ViewsErrorCategory } from './tikhub-errors'

/** Documented TikHub paths used by view refresh. Hybrid is documented but not used here. */
export const TIKTOK_AWEME_PATH = '/api/v1/tiktok/app/v3/fetch_one_video'
export const TIKTOK_SHARE_PATH = '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'
export const TIKTOK_MULTI_PATH = '/api/v1/tiktok/app/v3/fetch_multi_video_v2'
export const INSTAGRAM_V1_PATH = '/api/v1/instagram/v1/fetch_post_by_url'
export const INSTAGRAM_V2_PATH = '/api/v1/instagram/v2/fetch_post_info'

export type TikTokEndpointName = 'aweme_id' | 'share_url'
export type InstagramEndpointName = 'ig_v1' | 'ig_v2'

/**
 * At most two documented endpoints, aweme first when the id is known.
 * Never includes hybrid — that path 400s after a 429 and burns the same key.
 */
export function tikTokEndpointPlan(
  awemeId: string | null,
  isShareLink = false,
): TikTokEndpointName[] {
  const plan: TikTokEndpointName[] = []
  if (awemeId) plan.push('aweme_id')
  if (isShareLink) plan.push('share_url')
  return plan
}

export function instagramEndpointPlan(hasCode: boolean): InstagramEndpointName[] {
  return hasCode ? ['ig_v1', 'ig_v2'] : ['ig_v1']
}

/** Shared TikHub credential: do not try another endpoint under the same exhausted quota. */
export function isSharedQuotaCategory(category: ViewsErrorCategory): boolean {
  return category === 'rate_limited' || category === 'auth' || category === 'billing'
}

/**
 * Try the other documented endpoint only when it can plausibly succeed.
 * Timeouts and 5xx are retried at the job layer, not by immediately fanning out.
 */
export function shouldFallbackToNextEndpoint(category: ViewsErrorCategory): boolean {
  return category === 'metric_missing' || category === 'invalid_url' || category === 'unknown'
}

export function shouldRetrySameRequest(category: ViewsErrorCategory): boolean {
  return (
    category === 'timeout' ||
    category === 'provider_unavailable' ||
    category === 'rate_limited'
  )
}
