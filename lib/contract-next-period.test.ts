import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyContractPeriod,
  duplicateContractButtonLabel,
  nextContractPeriodDates,
} from './contract-next-period.ts'

test('classifies biweekly, monthly, and custom spans', () => {
  assert.equal(classifyContractPeriod('2026-03-01', '2026-03-14'), 'biweekly')
  assert.equal(classifyContractPeriod('2026-03-01', '2026-03-31'), 'monthly')
  assert.equal(classifyContractPeriod('2026-03-05', '2026-04-03'), 'monthly')
  assert.equal(classifyContractPeriod('2026-03-01', '2026-03-20'), 'custom')
})

test('next period starts the day after the previous end', () => {
  const biweekly = nextContractPeriodDates('2026-03-01', '2026-03-14')
  assert.deepEqual(biweekly, {
    startDate: '2026-03-15',
    endDate: '2026-03-28',
    kind: 'biweekly',
  })

  const custom = nextContractPeriodDates('2026-03-01', '2026-03-20')
  assert.deepEqual(custom, {
    startDate: '2026-03-21',
    endDate: '2026-04-09',
    kind: 'custom',
  })
})

test('calendar-month contracts roll to the next calendar month', () => {
  const march = nextContractPeriodDates('2026-03-01', '2026-03-31')
  assert.deepEqual(march, {
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    kind: 'monthly',
  })
})

test('button labels match period kind', () => {
  assert.equal(
    duplicateContractButtonLabel('biweekly'),
    'Duplicate contract for next biweekly',
  )
  assert.equal(
    duplicateContractButtonLabel('monthly'),
    'Duplicate contract for next monthly',
  )
  assert.equal(
    duplicateContractButtonLabel('custom'),
    'Duplicate contract for next period',
  )
})
