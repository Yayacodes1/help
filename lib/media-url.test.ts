import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractTikTokAwemeId, isTikTokShareLink } from './media-url.ts'

test('extractTikTokAwemeId uses video/photo path, not a generic id query', () => {
  assert.equal(
    extractTikTokAwemeId('https://www.tiktok.com/@user/video/7123456789012345678'),
    '7123456789012345678',
  )
  assert.equal(
    extractTikTokAwemeId('https://www.tiktok.com/@user/photo/7123456789012345678'),
    '7123456789012345678',
  )
  assert.equal(
    extractTikTokAwemeId('https://www.tiktok.com/t/ZTFNEj8Hk/?id=99'),
    null,
  )
  assert.equal(
    extractTikTokAwemeId('https://www.tiktok.com/t/ZTFNEj8Hk/?aweme_id=7123456789012345678'),
    '7123456789012345678',
  )
})

test('isTikTokShareLink matches documented share hosts, not canonical video URLs', () => {
  assert.equal(isTikTokShareLink('https://www.tiktok.com/t/ZTFNEj8Hk/'), true)
  assert.equal(isTikTokShareLink('https://vt.tiktok.com/ZSabc/'), true)
  assert.equal(isTikTokShareLink('https://www.tiktok.com/@user/video/7123456789012345678'), false)
  assert.equal(isTikTokShareLink('https://www.tiktok.com/@user'), false)
})
