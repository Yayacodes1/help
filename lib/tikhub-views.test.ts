import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalizeInstagramUrl,
  extractAwemeRecords,
  extractInstagramCode,
  extractPayloadAwemeId,
  extractViewCount,
  parseTikHubEnvelope,
  payloadMatchesRequestedVideo,
} from './tikhub-views.ts'
import {
  INSTAGRAM_REFRESH_USER_ERROR,
  isTransientViewsError,
  publicViewsError,
} from './tikhub-errors.ts'

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
  assert.equal(share.code, null)
  assert.equal(share.url, 'https://www.instagram.com/share/reel/ShareCode1/')
})

test('extractInstagramCode reads /p and /reel, not share tokens', () => {
  assert.equal(
    extractInstagramCode('https://www.instagram.com/reel/AbC123_-xy/'),
    'AbC123_-xy',
  )
  assert.equal(extractInstagramCode('https://www.instagram.com/p/PostCode99/'), 'PostCode99')
  assert.equal(
    extractInstagramCode('https://www.instagram.com/share/p/ShareP1/'),
    null,
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

test('extractViewCount unwraps JSON-string data and prefers play_count over likes', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: JSON.stringify({ media: { video_play_count: 9, like_count: 0 } }),
    }),
    9,
  )
})

test('extractViewCount uses documented TikTok aweme_detail.statistics.play_count including zero', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: {
        aweme_detail: {
          aweme_id: '7123456789012345678',
          statistics: { play_count: 12840, digg_count: 40, share_count: 2 },
        },
      },
    }),
    12840,
  )
  assert.equal(
    extractViewCount({
      code: 200,
      data: {
        aweme_detail: {
          aweme_id: '7123456789012345678',
          statistics: { play_count: 0, digg_count: 1 },
        },
      },
    }),
    0,
  )
})

test('extractViewCount reads Instagram data arrays and media_or_ad', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: [{ video_play_count: 321, like_count: 9 }],
    }),
    321,
  )
  assert.equal(
    extractViewCount({
      data: { media_or_ad: { play_count: 44, like_count: 2 } },
    }),
    44,
  )
})

test('extractViewCount uses documented Instagram media play fields and ignores likes', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: { media: { code: 'AbC123_-xy', video_play_count: 77, like_count: 900 } },
    }),
    77,
  )
  assert.equal(
    extractViewCount({
      data: { statistics: { like_count: 99, share_count: 3, comment_count: 4 } },
    }),
    null,
  )
})

test('extractViewCount rejects missing, negative, and malformed metrics', () => {
  assert.equal(extractViewCount({ data: { statistics: { play_count: null } } }), null)
  assert.equal(extractViewCount({ data: { statistics: { play_count: -3 } } }), null)
  assert.equal(extractViewCount({ data: { statistics: { play_count: 'nope' } } }), null)
  assert.equal(extractViewCount({ data: { statistics: { play_count: Number.NaN } } }), null)
  assert.equal(
    extractViewCount({
      data: { statistics: { play_count: 0 }, media: { views: 999 } },
    }),
    0,
  )
})

test('extractViewCount finds nested Instagram play_count the preferred list misses', () => {
  assert.equal(
    extractViewCount({
      code: 200,
      data: { items: [{ node: { media: { play_count: 6400, like_count: 12 } } }] },
    }),
    6400,
  )
})

test('extractAwemeRecords maps a batch aweme_list to ids and play counts', () => {
  const rows = extractAwemeRecords({
    code: 200,
    data: {
      aweme_list: [
        { aweme_id: '111', statistics: { play_count: 10 } },
        { aweme_id: '222', statistics: { play_count: 20 } },
      ],
    },
  })
  assert.deepEqual(
    rows
      .filter((row) => row.awemeId)
      .map((row) => [row.awemeId, row.views])
      .sort(),
    [
      ['111', 10],
      ['222', 20],
    ],
  )
})

test('payloadMatchesRequestedVideo rejects a different aweme_id', () => {
  const payload = {
    data: { aweme_detail: { aweme_id: '111', statistics: { play_count: 4 } } },
  }
  assert.equal(payloadMatchesRequestedVideo(payload, { awemeId: '111' }), true)
  assert.equal(payloadMatchesRequestedVideo(payload, { awemeId: '222' }), false)
  assert.equal(extractPayloadAwemeId(payload), '111')
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

test('public Instagram errors are classified instead of a generic retry line', () => {
  assert.match(publicViewsError('TikHub 400: HTTP 400', 'instagram'), /HTTP 400/)
  assert.match(publicViewsError('TikHub 429: rate limit', 'instagram'), /Rate limited/)
  assert.match(publicViewsError('TikHub 401: invalid token', 'instagram'), /TIKHUB_API_KEY/)
  assert.match(publicViewsError('instagram: no play/view count', 'instagram'), /Instagram response had no play/)
  assert.equal(
    publicViewsError('mysterious provider blob', 'instagram'),
    INSTAGRAM_REFRESH_USER_ERROR,
  )
  assert.match(
    publicViewsError('tiktok: no play/view count (share_url failed)', 'tiktok'),
    /TikTok response had no play/,
  )
})

test('transient view errors retry; missing counts do not', () => {
  assert.equal(isTransientViewsError('TikHub 429: rate limit'), true)
  assert.equal(isTransientViewsError('fetch failed (timeout)'), true)
  assert.equal(isTransientViewsError('TikHub 504: timed out'), true)
  assert.equal(isTransientViewsError('tiktok: no play/view count'), false)
  assert.equal(isTransientViewsError(INSTAGRAM_REFRESH_USER_ERROR), false)
})
