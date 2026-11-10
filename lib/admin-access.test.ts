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

test('Yahya and Ahmed see Ahmed’s wallet; Lula and Sultan do not', () => {
  assert.equal(canSeeAhmedWallet('yahya'), true)
  assert.equal(canSeeAhmedWallet('ahmed'), true)
  assert.equal(canSeeAhmedWallet('sultan'), false)
  assert.equal(canSeeAhmedWallet('lula'), false)
  assert.equal(canSeeAhmedWallet(null), false)
})

test('Yahya and Ahmed see Yahya’s expenses; Lula and Sultan do not', () => {
  assert.equal(canSeeYahyaExpenses('yahya'), true)
  assert.equal(canSeeYahyaExpenses('ahmed'), true)
  assert.equal(canSeeYahyaExpenses('sultan'), false)
  assert.equal(canSeeYahyaExpenses('lula'), false)
  assert.equal(canSeeYahyaExpenses(null), false)
})

test('Yahya and Ahmed can move Yahya expense people', () => {
  assert.equal(canMoveYahyaExpenses('yahya'), true)
  assert.equal(canMoveYahyaExpenses('ahmed'), true)
  assert.equal(canMoveYahyaExpenses('sultan'), false)
  assert.equal(canMoveYahyaExpenses('lula'), false)
  assert.equal(canMoveYahyaExpenses(null), false)
})

test('Ahmed, Lula, and Sultan see/add urgent list; Yahya sees only', () => {
  assert.equal(canSeeUrgentList('yahya'), true)
  assert.equal(canSeeUrgentList('ahmed'), true)
  assert.equal(canSeeUrgentList('lula'), true)
  assert.equal(canSeeUrgentList('sultan'), true)
  assert.equal(canSeeUrgentList(null), false)
  assert.equal(canSendUrgentList('ahmed'), true)
  assert.equal(canSendUrgentList('lula'), true)
  assert.equal(canSendUrgentList('sultan'), true)
  assert.equal(canSendUrgentList('yahya'), false)
})

test('Lula and Sultan see people under them, not the CEO or the COO', () => {
  assert.equal(canSeeStructureTier('yahya', 'ceo'), true)
  assert.equal(canSeeStructureTier('ahmed', 'coo'), true)
  assert.equal(canSeeStructureTier('sultan', 'ceo'), false)
  assert.equal(canSeeStructureTier('sultan', 'coo'), false)
  assert.equal(canSeeStructureTier('sultan', 'leader'), true)
  assert.equal(canSeeStructureTier('lula', 'ceo'), false)
  assert.equal(canSeeStructureTier('lula', 'coo'), false)
  assert.equal(canSeeStructureTier('lula', 'deputy_coo'), true)
  assert.equal(canSeeStructureTier('lula', 'leader'), true)
  assert.equal(canSeeStructureTier('lula', 'outreach'), true)
  assert.equal(canSeeStructureTier('lula', 'reposter'), true)
  assert.equal(canSeeStructureTier(null, 'leader'), false)
})

test('Ahmed, Lula, and Sultan can manage outreach accounts', () => {
  assert.equal(canManageOutreachAccounts('ahmed'), true)
  assert.equal(canManageOutreachAccounts('lula'), true)
  assert.equal(canManageOutreachAccounts('sultan'), true)
  assert.equal(canManageOutreachAccounts('yahya'), false)
  assert.equal(canManageOutreachAccounts(null), false)
})

test('Yahya, Ahmed, Lula, and Sultan can open creator payouts', () => {
  assert.equal(canSeeCreatorPayouts('yahya'), true)
  assert.equal(canSeeCreatorPayouts('ahmed'), true)
  assert.equal(canSeeCreatorPayouts('lula'), true)
  assert.equal(canSeeCreatorPayouts('sultan'), true)
  assert.equal(canSeeCreatorPayouts(null), false)
})
