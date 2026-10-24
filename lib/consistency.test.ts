import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildConsistency,
  lastCompletedStreak,
  type DayProgress,
} from './consistency.ts'

function counts(
  rows: Record<string, { instagram?: number; tiktok?: number }>,
): Record<string, { instagram: number; tiktok: number }> {
  const out: Record<string, { instagram: number; tiktok: number }> = {}
  for (const [date, value] of Object.entries(rows)) {
    out[date] = { instagram: value.instagram ?? 0, tiktok: value.tiktok ?? 0 }
  }
  return out
}

test('pending today does not zero yesterday’s streak', () => {
  const summary = buildConsistency({
    start: '2026-10-20',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-20': { instagram: 1 },
      '2026-10-21': { instagram: 1 },
      '2026-10-22': { instagram: 1 },
      '2026-10-23': { instagram: 1 },
    }),
  })
  assert.equal(summary.currentStreak, 4)
})

test('today’s hit continues the streak', () => {
  const summary = buildConsistency({
    start: '2026-10-22',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-22': { instagram: 1 },
      '2026-10-23': { instagram: 1 },
      '2026-10-24': { instagram: 1 },
    }),
  })
  assert.equal(summary.currentStreak, 3)
})

test('a confirmed miss breaks the streak', () => {
  const summary = buildConsistency({
    start: '2026-10-20',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-20': { instagram: 1 },
      '2026-10-21': { instagram: 1 },
      '2026-10-23': { instagram: 1 },
    }),
  })
  assert.equal(summary.currentStreak, 1)
})

test('break days skip and keep the streak', () => {
  const summary = buildConsistency({
    start: '2026-10-20',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-20': { instagram: 1 },
      '2026-10-21': { instagram: 1 },
      '2026-10-24': { instagram: 1 },
    }),
    breakDates: ['2026-10-22', '2026-10-23'],
  })
  assert.equal(summary.currentStreak, 3)
})

test('carry continues an unbroken streak across a new window', () => {
  const summary = buildConsistency({
    start: '2026-10-23',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-23': { instagram: 1 },
      '2026-10-24': { instagram: 1 },
    }),
    streakCarry: 10,
  })
  assert.equal(summary.currentStreak, 12)
})

test('carry is not applied after a miss', () => {
  const summary = buildConsistency({
    start: '2026-10-22',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-24': { instagram: 1 },
    }),
    streakCarry: 10,
  })
  assert.equal(summary.currentStreak, 1)
})

test('lookback days count toward streak but not hit rate', () => {
  const summary = buildConsistency({
    start: '2026-10-20',
    end: '2026-10-24',
    today: '2026-10-24',
    goalInstagram: 1,
    goalTiktok: 0,
    countsByDate: counts({
      '2026-10-20': { instagram: 1 },
      '2026-10-21': { instagram: 1 },
      '2026-10-22': { instagram: 1 },
      '2026-10-23': { instagram: 1 },
      '2026-10-24': { instagram: 1 },
    }),
    windowStart: '2026-10-23',
  })
  assert.equal(summary.currentStreak, 5)
  assert.equal(summary.requiredDays, 2)
  assert.equal(summary.hitDays, 2)
})

test('lastCompletedStreak returns the run before a miss', () => {
  const days: DayProgress[] = [
    { date: '2026-10-20', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-21', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-22', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-23', instagram: 0, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'miss' },
    { date: '2026-10-24', instagram: 0, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'miss' },
  ]
  assert.equal(lastCompletedStreak(days, '2026-10-24'), 3)
})

test('lastCompletedStreak after restore keeps carry through later hits', () => {
  const days: DayProgress[] = [
    { date: '2026-10-23', instagram: 0, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'miss' },
    { date: '2026-10-24', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-25', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
  ]
  assert.equal(
    lastCompletedStreak(days, '2026-10-25', { resumeOn: '2026-10-24', carry: 12 }),
    14,
  )
})

test('lastCompletedStreak forgives the latest miss and keeps later hits', () => {
  const days: DayProgress[] = [
    { date: '2026-10-20', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-21', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-22', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-23', instagram: 0, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'miss' },
    { date: '2026-10-24', instagram: 1, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'hit' },
    { date: '2026-10-25', instagram: 0, tiktok: 0, goalInstagram: 1, goalTiktok: 0, status: 'miss' },
  ]
  assert.equal(lastCompletedStreak(days, '2026-10-25'), 4)
})
