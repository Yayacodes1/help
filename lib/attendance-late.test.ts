import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withLateStatus } from './attendance-late.ts'

test('on-time hit stays hit', () => {
  assert.equal(
    withLateStatus('hit', '2026-10-24', 1, 0, [
      { platform: 'instagram', submitDay: '2026-10-24' },
    ]),
    'hit',
  )
})

test('goal completed after midnight is late', () => {
  assert.equal(
    withLateStatus('hit', '2026-10-24', 1, 1, [
      { platform: 'instagram', submitDay: '2026-10-24' },
      { platform: 'tiktok', submitDay: '2026-10-25' },
    ]),
    'late',
  )
})

test('miss and partial are not rewritten as late', () => {
  assert.equal(
    withLateStatus('miss', '2026-10-24', 1, 0, []),
    'miss',
  )
  assert.equal(
    withLateStatus('partial', '2026-10-24', 1, 1, [
      { platform: 'instagram', submitDay: '2026-10-25' },
    ]),
    'partial',
  )
})
