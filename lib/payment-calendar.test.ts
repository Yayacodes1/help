import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  amountToSar,
  monthGridDates,
  settleObligationsLite,
} from './payment-calendar-math.ts'

test('paying later settles the original due and does not add another obligation', () => {
  const { items, leftover } = settleObligationsLite(
    [
      {
        key: '10:0',
        creatorId: 1,
        contractId: 10,
        installmentIndex: 0,
        dueDate: '2026-10-01',
        dueAmount: 200,
        dueAmountSar: 200,
      },
      {
        key: '10:1',
        creatorId: 1,
        contractId: 10,
        installmentIndex: 1,
        dueDate: '2026-10-15',
        dueAmount: 200,
        dueAmountSar: 200,
      },
    ],
    [{ id: 1, creatorId: 1, contractId: 10, paidOn: '2026-10-20', amountSar: 200 }],
    '2026-10-21',
  )
  assert.equal(items[0].status, 'paid')
  assert.equal(items[0].remainingSar, 0)
  assert.equal(items[0].lastPaidOn, '2026-10-20')
  assert.equal(items[1].status, 'overdue')
  assert.equal(items[1].remainingSar, 200)
  assert.equal(leftover.length, 0)
  assert.equal(items.length, 2)
})

test('spent leftover only appears when payment exceeds scheduled dues', () => {
  const { leftover } = settleObligationsLite(
    [
      {
        key: '10:0',
        creatorId: 1,
        contractId: 10,
        installmentIndex: 0,
        dueDate: '2026-10-01',
        dueAmount: 100,
        dueAmountSar: 100,
      },
    ],
    [{ id: 2, creatorId: 1, contractId: 10, paidOn: '2026-10-05', amountSar: 150 }],
    '2026-10-05',
  )
  assert.equal(leftover.length, 1)
  assert.equal(leftover[0].leftoverSar, 50)
})

test('USD amounts convert with the existing 3.75 rate', () => {
  assert.equal(amountToSar(10, 'USD'), 37.5)
  assert.equal(amountToSar(10, 'SAR'), 10)
})

test('date-only month grid does not shift YYYY-MM-DD through local timezone', () => {
  const dates = monthGridDates('2026-10-01', '2026-10-31')
  assert.ok(dates.includes('2026-10-01'))
  assert.ok(dates.includes('2026-10-31'))
  assert.equal(dates[0], '2026-09-28')
  assert.equal(dates[3], '2026-10-01')
})

test('partial payment keeps one obligation and remaining balance', () => {
  const { items, leftover } = settleObligationsLite(
    [
      {
        key: '10:0',
        creatorId: 1,
        contractId: 10,
        installmentIndex: 0,
        dueDate: '2026-10-01',
        dueAmount: 200,
        dueAmountSar: 200,
      },
    ],
    [{ id: 3, creatorId: 1, contractId: 10, paidOn: '2026-10-01', amountSar: 80 }],
    '2026-10-01',
  )
  assert.equal(items.length, 1)
  assert.equal(items[0].status, 'partial')
  assert.equal(items[0].paidAmountSar, 80)
  assert.equal(items[0].remainingSar, 120)
  assert.equal(leftover.length, 0)
})

test('day scheduled total equals the sum of that day’s obligations', () => {
  const { items } = settleObligationsLite(
    [
      {
        key: '10:0',
        creatorId: 1,
        contractId: 10,
        installmentIndex: 0,
        dueDate: '2026-10-15',
        dueAmount: 100,
        dueAmountSar: 100,
      },
      {
        key: '11:0',
        creatorId: 2,
        contractId: 11,
        installmentIndex: 0,
        dueDate: '2026-10-15',
        dueAmount: 50,
        dueAmountSar: 50,
      },
      {
        key: '12:0',
        creatorId: 3,
        contractId: 12,
        installmentIndex: 0,
        dueDate: '2026-10-16',
        dueAmount: 70,
        dueAmountSar: 70,
      },
    ],
    [],
    '2026-10-10',
  )
  const day = items.filter((i) => i.dueDate === '2026-10-15')
  const scheduled = day.reduce((s, i) => s + i.dueAmountSar, 0)
  assert.equal(scheduled, 150)
  assert.equal(new Set(day.map((i) => i.creatorId)).size, 2)
})
