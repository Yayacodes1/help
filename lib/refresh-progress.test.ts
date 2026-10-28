import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isRetryEligible,
  refreshJobHeading,
  refreshJobPercent,
  shouldShowRefreshCards,
  splitRefreshResults,
} from './refresh-progress.ts'

test('running jobs never report 100% while work remains', () => {
  assert.equal(
    refreshJobPercent({
      status: 'running',
      total: 25,
      processed: 25,
      succeeded: 4,
      failed: 21,
      waiting: 0,
    }),
    99,
  )
  assert.ok(
    refreshJobPercent({
      status: 'running',
      total: 25,
      processed: 4,
      succeeded: 4,
      failed: 0,
      waiting: 21,
    }) < 100,
  )
})

test('completed heading changes off Refreshing this page', () => {
  assert.equal(
    refreshJobHeading({
      status: 'running',
      total: 25,
      processed: 4,
      succeeded: 4,
      failed: 0,
      waiting: 0,
    }),
    'Refreshing this page',
  )
  assert.equal(
    refreshJobHeading({
      status: 'running',
      total: 25,
      processed: 4,
      succeeded: 4,
      failed: 0,
      waiting: 21,
    }),
    'Waiting to retry this page',
  )
  assert.equal(
    refreshJobHeading({
      status: 'completed',
      total: 25,
      processed: 25,
      succeeded: 25,
      failed: 0,
    }),
    'Refresh complete',
  )
  assert.equal(
    refreshJobHeading({
      status: 'completed',
      total: 25,
      processed: 25,
      succeeded: 4,
      failed: 21,
    }),
    'Refresh finished with failures',
  )
})

test('splitRefreshResults separates updated, unchanged, and failed links', () => {
  const split = splitRefreshResults([
    {
      id: 1,
      url: 'https://tiktok.com/1',
      status: 'success',
      viewsBefore: 10,
      viewsAfter: 40,
    },
    {
      id: 2,
      url: 'https://instagram.com/p/x/',
      status: 'success',
      viewsBefore: 5,
      viewsAfter: 5,
    },
    {
      id: 3,
      url: 'https://tiktok.com/3',
      status: 'failed',
      error: 'Rate limited',
      viewsBefore: 8,
      views: 8,
    },
  ])
  assert.deepEqual(
    split.updated.map((row) => row.id),
    [1],
  )
  assert.deepEqual(
    split.unchanged.map((row) => row.id),
    [2],
  )
  assert.deepEqual(
    split.failed.map((row) => row.id),
    [3],
  )
})

test('refresh cards stay hidden after dismiss, navigation, or another creator', () => {
  const shown = {
    dismissed: false,
    ownedJobId: 9,
    jobId: 9,
    pageCreatorId: 1,
    jobCreatorId: 1,
  }
  assert.equal(shouldShowRefreshCards(shown), true)
  assert.equal(shouldShowRefreshCards({ ...shown, dismissed: true }), false)
  assert.equal(shouldShowRefreshCards({ ...shown, ownedJobId: null }), false)
  assert.equal(shouldShowRefreshCards({ ...shown, jobId: 10 }), false)
  assert.equal(shouldShowRefreshCards({ ...shown, pageCreatorId: 2 }), false)
  assert.equal(
    shouldShowRefreshCards({ ...shown, dismissed: false, ownedJobId: null, jobId: 9 }),
    false,
    'reload or revisit must not restore cards from a previous run',
  )
  const afterReturnToA = {
    dismissed: true,
    ownedJobId: null,
    jobId: 9,
    pageCreatorId: 1,
    jobCreatorId: 1,
  }
  assert.equal(shouldShowRefreshCards(afterReturnToA), false)
  assert.equal(
    shouldShowRefreshCards({
      dismissed: false,
      ownedJobId: 11,
      jobId: 11,
      pageCreatorId: 1,
      jobCreatorId: 1,
    }),
    true,
    'a newly started run on this creator may show cards',
  )
})

test('retry targets only failed items whose cooldown has elapsed', () => {
  assert.equal(isRetryEligible({ status: 'waiting' }), false)
  assert.equal(isRetryEligible({ status: 'success' }), false)
  assert.equal(isRetryEligible({ status: 'failed', retryAt: null }), true)
  const future = new Date(Date.now() + 60_000).toISOString()
  assert.equal(isRetryEligible({ status: 'failed', retryAt: future }), false)
  const past = new Date(Date.now() - 1_000).toISOString()
  assert.equal(isRetryEligible({ status: 'failed', retryAt: past }), true)
})
