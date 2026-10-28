import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateDayGains,
  buildDailyViewsCompare,
  calendarDayInTimeZone,
  dailyViewsChangePct,
  formatDailyViewsSection,
  formatPct,
  videoDayGain,
  zonedDayStartUtc,
  type ViewSnapshotPoint,
} from './daily-views.ts'

const DAY = '2026-10-27'
const NEXT = '2026-10-28'
const PREV = '2026-10-26'

function iso(utc: string): string {
  return new Date(utc).toISOString()
}

test('Riyadh midnight is 21:00 UTC the previous calendar day', () => {
  assert.equal(zonedDayStartUtc(NEXT).toISOString(), '2026-10-27T21:00:00.000Z')
  assert.equal(zonedDayStartUtc(DAY).toISOString(), '2026-10-26T21:00:00.000Z')
  assert.equal(calendarDayInTimeZone('2026-10-27T20:59:59.000Z', 'Asia/Riyadh'), DAY)
  assert.equal(calendarDayInTimeZone('2026-10-27T21:00:00.000Z', 'Asia/Riyadh'), NEXT)
})

test('percentage is the total-to-total ratio, not an average of videos', () => {
  assert.equal(dailyViewsChangePct(125_000, 100_000), 25)
  assert.equal(dailyViewsChangePct(80, 100), -20)
  assert.equal(dailyViewsChangePct(0, 0), 0)
  assert.equal(dailyViewsChangePct(5_000, 0), null)
  assert.equal(dailyViewsChangePct(130, 110), (20 / 110) * 100)
  assert.notEqual(dailyViewsChangePct(130, 110), (100 + 10) / 2)
  assert.equal(formatPct(25), '+25.0%')
  assert.equal(formatPct(-20), '−20.0%')
  assert.equal(formatPct(0), '0%')
  assert.equal(formatPct(null), 'N/A')
})

test('first observation is a baseline and does not count lifetime views', () => {
  const points = [
    { views: 50_000, observedAt: iso('2026-10-27T10:00:00.000Z') },
    { views: 51_000, observedAt: iso('2026-10-27T14:00:00.000Z') },
  ]
  const firstOnly = videoDayGain(points.slice(0, 1), DAY, new Date('2026-10-27T18:00:00.000Z'))
  assert.equal(firstOnly.reason, 'collecting')
  assert.equal(firstOnly.gain, null)

  const afterSecond = videoDayGain(points, DAY, new Date('2026-10-27T18:00:00.000Z'))
  assert.equal(afterSecond.reason, 'measured')
  assert.equal(afterSecond.gain, 1_000)
})

test('repeated refreshes on the same day do not double-count', () => {
  const points = [
    { views: 100_000, observedAt: iso('2026-10-26T12:00:00.000Z') },
    { views: 110_000, observedAt: iso('2026-10-27T07:00:00.000Z') },
    { views: 120_000, observedAt: iso('2026-10-27T12:00:00.000Z') },
    { views: 125_000, observedAt: iso('2026-10-27T14:00:00.000Z') },
  ]
  const one = videoDayGain(points, DAY, new Date('2026-10-27T18:00:00.000Z'))
  assert.equal(one.gain, 25_000)
})

test('decreased platform counts do not subtract from the day', () => {
  const one = videoDayGain(
    [
      { views: 100, observedAt: iso('2026-10-26T12:00:00.000Z') },
      { views: 90, observedAt: iso('2026-10-27T12:00:00.000Z') },
    ],
    DAY,
    new Date('2026-10-27T18:00:00.000Z'),
  )
  assert.equal(one.gain, 0)
  assert.equal(one.reason, 'measured')
})

test('duplicate video links share one identity and one gain', () => {
  const snapshots: ViewSnapshotPoint[] = [
    { videoId: 'tt:1', views: 10, observedAt: iso('2026-10-26T12:00:00.000Z') },
    { videoId: 'tt:1', views: 18, observedAt: iso('2026-10-27T12:00:00.000Z') },
    { videoId: 'tt:1', views: 18, observedAt: iso('2026-10-27T12:01:00.000Z') },
  ]
  const day = aggregateDayGains(snapshots, DAY, new Date('2026-10-27T18:00:00.000Z'))
  assert.equal(day.gain, 8)
  assert.equal(day.measuredVideos, 1)
})

test('stale videos without a reading on the day are missing, not invented', () => {
  const snapshots: ViewSnapshotPoint[] = [
    { videoId: 'a', views: 40, observedAt: iso('2026-10-26T12:00:00.000Z') },
  ]
  const day = aggregateDayGains(snapshots, DAY, new Date('2026-10-27T18:00:00.000Z'))
  assert.equal(day.gain, 0)
  assert.equal(day.measuredVideos, 0)
  assert.equal(day.missingVideos, 1)
})

test('live vs final labels and the sample 125k vs 100k report', () => {
  const snapshots: ViewSnapshotPoint[] = [
    { videoId: 'a', views: 80_000, observedAt: iso('2026-10-25T12:00:00.000Z') },
    { videoId: 'a', views: 100_000, observedAt: iso('2026-10-26T14:00:00.000Z') },
    { videoId: 'a', views: 125_000, observedAt: iso('2026-10-27T14:00:00.000Z') },
  ]
  const now = new Date('2026-10-27T14:05:00.000Z')
  const live = buildDailyViewsCompare({
    mode: 'live',
    currentDay: DAY,
    current: aggregateDayGains(snapshots, DAY, now),
    previous: aggregateDayGains(snapshots, PREV, now),
  })
  assert.equal(live.currentGain, 25_000)
  assert.equal(live.previousGain, 20_000)
  assert.equal(live.delta, 5_000)
  assert.equal(live.pct, 25)

  const sample = buildDailyViewsCompare({
    mode: 'live',
    currentDay: DAY,
    current: { ...live.current, gain: 125_000, measuredVideos: 10 },
    previous: { ...live.previous, gain: 100_000, measuredVideos: 10 },
  })
  const text = formatDailyViewsSection(sample)
  assert.match(text, /📈 DAILY VIEWS — Riyadh time/)
  assert.match(text, /Today so far: 125,000/)
  assert.match(text, /Yesterday, full day: 100,000/)
  assert.match(text, /Change: \+25,000 \(\+25\.0%\) 📈/)

  const finalNow = new Date('2026-10-27T21:10:00.000Z')
  const finalReport = buildDailyViewsCompare({
    mode: 'final',
    currentDay: DAY,
    current: aggregateDayGains(snapshots, DAY, finalNow),
    previous: aggregateDayGains(snapshots, PREV, finalNow),
  })
  const finalText = formatDailyViewsSection(finalReport)
  assert.match(finalText, /Tue, Oct 27/)
  assert.match(finalText, /Mon, Oct 26/)
  assert.doesNotMatch(finalText, /so far/)
})

test('history unavailable until a valid two-day comparison exists', () => {
  const snapshots: ViewSnapshotPoint[] = [
    { videoId: 'a', views: 9, observedAt: iso('2026-10-27T12:00:00.000Z') },
  ]
  const now = new Date('2026-10-27T13:00:00.000Z')
  const compare = buildDailyViewsCompare({
    mode: 'live',
    currentDay: DAY,
    current: aggregateDayGains(snapshots, DAY, now),
    previous: aggregateDayGains(snapshots, PREV, now),
  })
  assert.equal(compare.status, 'collecting')
  assert.match(formatDailyViewsSection(compare), /Collecting data/)
})

test('yesterday zero shows N/A percent; both zero shows 0%', () => {
  const fromZero = buildDailyViewsCompare({
    mode: 'live',
    currentDay: DAY,
    current: {
      day: DAY,
      gain: 4_000,
      measuredVideos: 2,
      collectingVideos: 0,
      missingVideos: 0,
      trackedVideos: 2,
      lastObservedAt: iso('2026-10-27T12:00:00.000Z'),
      closeIsEarly: false,
    },
    previous: {
      day: PREV,
      gain: 0,
      measuredVideos: 2,
      collectingVideos: 0,
      missingVideos: 0,
      trackedVideos: 2,
      lastObservedAt: iso('2026-10-26T12:00:00.000Z'),
      closeIsEarly: false,
    },
  })
  assert.equal(fromZero.pct, null)
  assert.match(formatDailyViewsSection(fromZero), /N\/A/)
  assert.match(formatDailyViewsSection(fromZero), /\+4,000/)

  const bothZero = buildDailyViewsCompare({
    mode: 'live',
    currentDay: DAY,
    current: { ...fromZero.current, gain: 0 },
    previous: fromZero.previous,
  })
  assert.equal(bothZero.pct, 0)
  assert.match(formatDailyViewsSection(bothZero), /Change: 0 \(0%\)/)
})

test('a reading just after Riyadh midnight belongs to the new day', () => {
  const points = [
    { views: 10, observedAt: iso('2026-10-27T20:59:00.000Z') },
    { views: 12, observedAt: iso('2026-10-27T21:01:00.000Z') },
  ]
  const beforeMidnight = videoDayGain(points, DAY, new Date('2026-10-27T20:59:30.000Z'))
  assert.equal(beforeMidnight.gain, null)
  const oldDay = videoDayGain(points, DAY, new Date('2026-10-28T00:00:00.000Z'))
  assert.equal(oldDay.gain, null)
  const newDay = videoDayGain(points, NEXT, new Date('2026-10-28T12:00:00.000Z'))
  assert.equal(newDay.gain, 2)
})
