import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canManageOutreachAccounts,
  canMoveYahyaExpenses,
  canSeeAhmedWallet,
  canSeeCreatorPayouts,
  canSeeStructureTier,
  canSeeYahyaExpenses,
  canSeeUrgentList,
  canSendUrgentList,
} from './admin-access.ts'

test('only Yahya and Ahmed see Ahmed’s wallet', () => {
  assert.equal(canSeeAhmedWallet('yahya'), true)
  assert.equal(canSeeAhmedWallet('ahmed'), true)
  assert.equal(canSeeAhmedWallet('lula'), false)
  assert.equal(canSeeAhmedWallet(null), false)
})

test('only Yahya and Ahmed see Yahya’s expenses', () => {
  assert.equal(canSeeYahyaExpenses('yahya'), true)
  assert.equal(canSeeYahyaExpenses('ahmed'), true)
  assert.equal(canSeeYahyaExpenses('lula'), false)
  assert.equal(canSeeYahyaExpenses(null), false)
})

test('only Yahya and Ahmed can move Yahya expense people', () => {
  assert.equal(canMoveYahyaExpenses('yahya'), true)
  assert.equal(canMoveYahyaExpenses('ahmed'), true)
  assert.equal(canMoveYahyaExpenses('lula'), false)
  assert.equal(canMoveYahyaExpenses(null), false)
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

test('Lula sees people under her, not the CEO or the COO', () => {
  assert.equal(canSeeStructureTier('yahya', 'ceo'), true)
  assert.equal(canSeeStructureTier('ahmed', 'coo'), true)
  assert.equal(canSeeStructureTier('lula', 'ceo'), false)
  assert.equal(canSeeStructureTier('lula', 'coo'), false)
  assert.equal(canSeeStructureTier('lula', 'deputy_coo'), true)
  assert.equal(canSeeStructureTier('lula', 'leader'), true)
  assert.equal(canSeeStructureTier('lula', 'outreach'), true)
  assert.equal(canSeeStructureTier('lula', 'reposter'), true)
  assert.equal(canSeeStructureTier(null, 'leader'), false)
})

test('Ahmed and Lula can manage outreach accounts', () => {
  assert.equal(canManageOutreachAccounts('ahmed'), true)
  assert.equal(canManageOutreachAccounts('lula'), true)
  assert.equal(canManageOutreachAccounts('yahya'), false)
  assert.equal(canManageOutreachAccounts(null), false)
})

test('Yahya, Ahmed, and Lula can open creator payouts', () => {
  assert.equal(canSeeCreatorPayouts('yahya'), true)
  assert.equal(canSeeCreatorPayouts('ahmed'), true)
  assert.equal(canSeeCreatorPayouts('lula'), true)
  assert.equal(canSeeCreatorPayouts(null), false)
})
