import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  backoffMs,
  classifyViewsError,
  parseRetryAfterMs,
  publicViewsCategoryMessage,
} from './tikhub-errors.ts'

test('classifyViewsError maps 429, 400, auth, and missing metrics', () => {
  assert.equal(classifyViewsError('x', 429), 'rate_limited')
  assert.equal(classifyViewsError('TikHub 429: rate limit'), 'rate_limited')
  assert.equal(classifyViewsError('TikHub 400: HTTP 400'), 'invalid_url')
  assert.equal(classifyViewsError('TikHub 401: invalid token'), 'auth')
  assert.equal(classifyViewsError('tiktok: no play/view count'), 'metric_missing')
  assert.equal(classifyViewsError('share_url: no play_count'), 'metric_missing')
  assert.equal(classifyViewsError('Couldn\'t refresh Instagram views. Try again later.'), 'unknown')
})

test('parseRetryAfterMs prefers seconds and HTTP-date, otherwise a short default', () => {
  assert.equal(parseRetryAfterMs('3'), 3_000)
  assert.equal(parseRetryAfterMs('0'), 1_000)
  const future = new Date(Date.now() + 8_000).toUTCString()
  const wait = parseRetryAfterMs(future)
  assert.ok(wait >= 1_000 && wait <= 60_000)
  assert.equal(parseRetryAfterMs(''), 5_000)
})

test('backoffMs is bounded with jitter', () => {
  const low = backoffMs(0, 1_000, 20_000, () => 0)
  const high = backoffMs(8, 1_000, 20_000, () => 1)
  assert.ok(low >= 500 && low <= 1_000)
  assert.equal(high, 20_000)
})

test('public messages are actionable, not a generic Instagram line', () => {
  assert.match(publicViewsCategoryMessage('rate_limited', 'instagram'), /Rate limited/)
  assert.match(publicViewsCategoryMessage('auth', 'tiktok'), /TIKHUB_API_KEY/)
  assert.match(publicViewsCategoryMessage('invalid_url', 'tiktok'), /HTTP 400/)
  assert.match(publicViewsCategoryMessage('metric_missing', 'instagram'), /Instagram/)
})
