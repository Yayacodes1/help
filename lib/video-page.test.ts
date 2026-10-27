import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVideoPage, parseVideoPageSize, videoPaging, VIDEO_PAGE_SIZE } from './video-page.ts'

test('default page size is 50', () => {
  assert.equal(VIDEO_PAGE_SIZE, 50)
  assert.equal(parseVideoPageSize(undefined), 50)
  assert.equal(parseVideoPageSize('40'), 50)
})

test('allows 25, 50, and 100 per page', () => {
  assert.equal(parseVideoPageSize('25'), 25)
  assert.equal(parseVideoPageSize('50'), 50)
  assert.equal(parseVideoPageSize('100'), 100)
})

test('videoPaging keeps filters via offset math', () => {
  const a = videoPaging({ vPage: '3', vSize: '25' })
  assert.equal(a.page, 3)
  assert.equal(a.pageSize, 25)
  assert.equal(a.offset, 50)
  assert.equal(parseVideoPage('0'), 1)
})

test('page 10 at 50 per page starts at offset 450', () => {
  const a = videoPaging({ vPage: '10', vSize: '50' })
  assert.equal(a.offset, 450)
  assert.equal(a.pageSize, 50)
  assert.equal(parseVideoPageSize('75'), 50)
  assert.equal(parseVideoPageSize('100'), 100)
})
