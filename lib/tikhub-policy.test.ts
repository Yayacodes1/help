import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  instagramEndpointPlan,
  isSharedQuotaCategory,
  shouldFallbackToNextEndpoint,
  shouldRetrySameRequest,
  tikTokEndpointPlan,
} from './tikhub-policy.ts'

test('TikTok plan is at most two documented endpoints and never hybrid', () => {
  assert.deepEqual(tikTokEndpointPlan('7123456789', false), ['aweme_id'])
  assert.deepEqual(tikTokEndpointPlan(null, true), ['share_url'])
  assert.deepEqual(tikTokEndpointPlan('7123456789', true), ['aweme_id', 'share_url'])
  assert.deepEqual(tikTokEndpointPlan(null, false), [])
  assert.equal(
    tikTokEndpointPlan('1', true).includes('hybrid' as never),
    false,
  )
})

test('Instagram uses v1 then v2 only when a shortcode exists', () => {
  assert.deepEqual(instagramEndpointPlan(true), ['ig_v1', 'ig_v2'])
  assert.deepEqual(instagramEndpointPlan(false), ['ig_v1'])
})

test('HTTP 429 / auth / billing stop the fallback chain', () => {
  assert.equal(isSharedQuotaCategory('rate_limited'), true)
  assert.equal(shouldFallbackToNextEndpoint('rate_limited'), false)
  assert.equal(shouldFallbackToNextEndpoint('auth'), false)
  assert.equal(shouldFallbackToNextEndpoint('billing'), false)
  assert.equal(shouldRetrySameRequest('rate_limited'), true)
})

test('HTTP 400 is not retried on the same endpoint; missing metrics may try the other', () => {
  assert.equal(shouldRetrySameRequest('invalid_url'), false)
  assert.equal(shouldFallbackToNextEndpoint('invalid_url'), true)
  assert.equal(shouldFallbackToNextEndpoint('metric_missing'), true)
  assert.equal(shouldRetrySameRequest('metric_missing'), false)
})

test('timeouts retry at the job layer without an immediate second endpoint', () => {
  assert.equal(shouldRetrySameRequest('timeout'), true)
  assert.equal(shouldFallbackToNextEndpoint('timeout'), false)
  assert.equal(shouldFallbackToNextEndpoint('provider_unavailable'), false)
})
