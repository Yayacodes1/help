import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  idsOnPage,
  normalizeSubmissionIds,
  refreshRunBelongsToPage,
  snapshotRefreshTarget,
} from './refresh-scope.ts'

test('normalizeSubmissionIds snapshots unique positive ids and caps the page', () => {
  assert.deepEqual(normalizeSubmissionIds([3, 3, 1, 0, -2, '8', null, 2.9]), [3, 1, 8, 2])
  assert.equal(normalizeSubmissionIds(Array.from({ length: 250 }, (_, i) => i + 1)).length, 200)
  assert.deepEqual(normalizeSubmissionIds(undefined), [])
  assert.deepEqual(normalizeSubmissionIds('1,2,3'), [])
})

test('idsOnPage follows the displayed rows, not a later filter change', () => {
  const page = [{ id: 10 }, { id: 11 }, { id: 12 }]
  const snapshot = idsOnPage(page)
  const afterFilterChange = [{ id: 10 }, { id: 99 }, { id: 100 }, { id: 101 }]
  assert.deepEqual(snapshot, [10, 11, 12])
  assert.notDeepEqual(snapshot, idsOnPage(afterFilterChange))
})

test('snapshotRefreshTarget freezes the current creator and page videos', () => {
  const started = snapshotRefreshTarget({
    creatorId: 7,
    submissionIds: [11, 12, 12, 0],
  })
  assert.deepEqual(started, { creatorId: 7, submissionIds: [11, 12], allMatching: false })
  const laterPage = snapshotRefreshTarget({
    creatorId: 8,
    submissionIds: [99, 100],
  })
  assert.notEqual(laterPage.creatorId, started.creatorId)
  assert.notDeepEqual(laterPage.submissionIds, started.submissionIds)
  assert.equal(refreshRunBelongsToPage(started.creatorId, 7), true)
  assert.equal(refreshRunBelongsToPage(started.creatorId, 8), false)
})
