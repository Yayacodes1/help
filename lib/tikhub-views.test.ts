import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  INSTAGRAM_REFRESH_USER_ERROR,
  canonicalizeInstagramUrl,
  extractInstagramCode,
  extractViewCount,
  isTransientViewsError,
  parseTikHubEnvelope,
  publicViewsError,
} from './tikhub-views.ts'

test('canonicalize Instagram URLs: strip query, keep shortcode', () => {
  const reel = canonicalizeInstagramUrl(
    'https://www.instagram.com/reel/AbC123_-xy/?utm_source=ig_web&igsh=xyz',
  )
  assert.equal(reel.code, 'AbC123_-xy')
  assert.equal(reel.url, 'https://www.instagram.com/reel/AbC123_-xy/')

  const post = canonicalizeInstagramUrl('https://instagram.com/p/PostCode99/?img_index=1')
  assert.equal(post.code, 'PostCode99')
  assert.equal(post.url, 'https://www.instagram.com/p/PostCode99/')

  const share = canonicalizeInstagramUrl('https://www.instagram.com/share/reel/ShareCode1/')
  assert.equal(share.code, 'ShareCode1')
  assert.equal(share.url, 'https://www.instagram.com/reel/ShareCode1/')
})

test('extractInstagramCode reads /p, /reel, and share paths', () => {
  assert.equal(
    extractInstagramCode('https://www.instagram.com/reel/AbC123_-xy/'),
    'AbC123_-xy',
  )
  assert.equal(extractInstagramCode('https://www.instagram.com/p/PostCode99/'), 'PostCode99')
  assert.equal(
    extractInstagramCode('https://www.instagram.com/share/p/ShareP1/'),
    'ShareP1',
  )
})

test('extractViewCount: success, zero, missing', () => {
  assert.equal(
    extractViewCount({
      data: { media: { video_play_count: 12840 } },
    }),
    12840,
  )
  assert.equal(
    extractViewCount({
      data: { statistics: { play_count: 0 } },
    }),
    0,
  )
  assert.equal(extractViewCount({ data: { id: 'x', caption: 'hi' } }), null)
})

test('extractViewCount unwraps JSON-string data and prefers non-zero', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: JSON.stringify({ media: { video_play_count: 9, like_count: 0 } }),
    }),
    9,
  )
})

test('parseTikHubEnvelope treats HTTP 400 and JSON code 400 as failure', () => {
  const http = parseTikHubEnvelope(
    { code: 400, message: 'bad url', request_id: 'req-1' },
    400,
  )
  assert.equal(http.ok, false)
  if (!http.ok) {
    assert.equal(http.status, 400)
    assert.equal(http.requestId, 'req-1')
  }

  const body = parseTikHubEnvelope(
    { code: 400, message: 'invalid', request_id: 'req-2', data: {} },
    200,
  )
  assert.equal(body.ok, false)
  if (!body.ok) {
    assert.equal(body.status, 400)
    assert.equal(body.requestId, 'req-2')
  }

  const ok = parseTikHubEnvelope({ code: 200, data: { media: { play_count: 3 } } }, 200)
  assert.equal(ok.ok, true)
})

test('public Instagram error is one short line', () => {
  assert.equal(
    publicViewsError('TikHub 400: bad · TikHub 400: bad', 'instagram'),
    INSTAGRAM_REFRESH_USER_ERROR,
  )
  assert.equal(
    publicViewsError('instagram: no play/view count (TikHub 400: x · v2: TikHub 400: x)'),
    INSTAGRAM_REFRESH_USER_ERROR,
  )
  assert.equal(
    publicViewsError('tiktok: no play/view count (share_url failed)', 'tiktok'),
    'tiktok: no play/view count (share_url failed)',
  )
})

test('transient view errors retry; missing counts do not', () => {
  assert.equal(isTransientViewsError('TikHub 429: rate limit'), true)
  assert.equal(isTransientViewsError('fetch failed (timeout)'), true)
  assert.equal(isTransientViewsError('TikHub 504: timed out'), true)
  assert.equal(isTransientViewsError('tiktok: no play/view count'), false)
  assert.equal(isTransientViewsError(INSTAGRAM_REFRESH_USER_ERROR), false)
})
