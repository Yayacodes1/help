import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consistencyCalendarEnd, streakMustPost } from './probation-copy.ts'

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

test('ended + unfinished extends consistency calendar through today', () => {
  const result = consistencyCalendarEnd({
    startDate: '2026-10-04',
    endDate: '2026-11-04',
    windowEnd: '2026-11-04',
    today: '2026-11-15',
    videosComplete: false,
  })
  assert.deepEqual(result, {
    end: '2026-11-15',
    contractEndedOn: '2026-11-04',
    extendedPastEnd: true,
  })
})

test('ended + videos done keeps calendar at contract end', () => {
  const result = consistencyCalendarEnd({
    startDate: '2026-10-04',
    endDate: '2026-11-04',
    windowEnd: '2026-11-04',
    today: '2026-11-15',
    videosComplete: true,
  })
  assert.deepEqual(result, {
    end: '2026-11-04',
    contractEndedOn: '2026-11-04',
    extendedPastEnd: false,
  })
})
