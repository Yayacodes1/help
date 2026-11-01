import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canManageOutreachAccounts,
  canSeeAhmedWallet,
  canSeeUrgentList,
  canSendUrgentList,
} from './admin-access.ts'

test('only Yahya and Ahmed see Ahmed’s wallet', () => {
  assert.equal(canSeeAhmedWallet('yahya'), true)
  assert.equal(canSeeAhmedWallet('ahmed'), true)
  assert.equal(canSeeAhmedWallet('lula'), false)
  assert.equal(canSeeAhmedWallet(null), false)
})

test('Ahmed, Lula, and Yahya see the urgent list; Ahmed and Lula add to it', () => {
  assert.equal(canSeeUrgentList('yahya'), true)
  assert.equal(canSeeUrgentList('ahmed'), true)
  assert.equal(canSeeUrgentList('lula'), true)
  assert.equal(canSeeUrgentList(null), false)
  assert.equal(canSendUrgentList('ahmed'), true)
  assert.equal(canSendUrgentList('lula'), true)
  assert.equal(canSendUrgentList('yahya'), false)
})

test('Ahmed and Lula can manage outreach accounts', () => {
  assert.equal(canManageOutreachAccounts('ahmed'), true)
  assert.equal(canManageOutreachAccounts('lula'), true)
  assert.equal(canManageOutreachAccounts('yahya'), false)
  assert.equal(canManageOutreachAccounts(null), false)
})
