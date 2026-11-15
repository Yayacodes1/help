import assert from 'node:assert/strict'
import { test } from 'node:test'
import { streakMustPost } from './probation-copy.ts'

test('open calendar always must post', () => {
  assert.equal(
    streakMustPost({
      asOf: '2026-11-14',
      startDate: '2026-11-01',
      endDate: '2026-11-25',
      videosComplete: true,
    }),
    true,
  )
})

test('ended + unfinished videos still must post', () => {
  assert.equal(
    streakMustPost({
      asOf: '2026-11-14',
      startDate: '2026-10-04',
      endDate: '2026-11-04',
      videosComplete: false,
    }),
    true,
  )
})

test('ended + videos done → off streaks (pay / new contract)', () => {
  assert.equal(
    streakMustPost({
      asOf: '2026-11-14',
      startDate: '2026-10-06',
      endDate: '2026-11-13',
      videosComplete: true,
    }),
    false,
  )
})

test('future contract start → not yet', () => {
  assert.equal(
    streakMustPost({
      asOf: '2026-11-14',
      startDate: '2026-11-18',
      endDate: '2026-12-18',
      videosComplete: false,
    }),
    false,
  )
})
