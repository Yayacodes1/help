import assert from 'node:assert/strict'
import { test } from 'node:test'
import { personBelongsOnProjectManage } from './project-scope.ts'

test('selecting Notek does not list Miqat creators, and vice versa', () => {
  const notek = 1
  const miqat = 2
  const notekCreator = { role: 'creator', project_id: notek }
  const miqatCreator = { role: 'creator', project_id: miqat }
  const unassigned = { role: 'creator', project_id: null }
  const reposter = { role: 'reposter', project_id: miqat }

  assert.equal(personBelongsOnProjectManage(notekCreator, notek), true)
  assert.equal(personBelongsOnProjectManage(miqatCreator, notek), false)
  assert.equal(personBelongsOnProjectManage(notekCreator, miqat), false)
  assert.equal(personBelongsOnProjectManage(miqatCreator, miqat), true)
  assert.equal(personBelongsOnProjectManage(unassigned, notek), true)
  assert.equal(personBelongsOnProjectManage(reposter, notek), true)
  assert.equal(personBelongsOnProjectManage(notekCreator, null), true)
})
