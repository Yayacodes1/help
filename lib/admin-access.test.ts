import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canManageOutreachAccounts, canSeeAhmedWallet } from './admin-access.ts'

test('only Yahya and Ahmed see Ahmed’s wallet', () => {
  assert.equal(canSeeAhmedWallet('yahya'), true)
  assert.equal(canSeeAhmedWallet('ahmed'), true)
  assert.equal(canSeeAhmedWallet('lula'), false)
  assert.equal(canSeeAhmedWallet(null), false)
})

test('Ahmed and Lula can manage outreach accounts', () => {
  assert.equal(canManageOutreachAccounts('ahmed'), true)
  assert.equal(canManageOutreachAccounts('lula'), true)
  assert.equal(canManageOutreachAccounts('yahya'), false)
  assert.equal(canManageOutreachAccounts(null), false)
})
