import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeOfferPhone } from './creator-offer-phone.ts'

test('Saudi dial + national 9 digits', () => {
  const phone = normalizeOfferPhone('966', '501234567')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+966501234567')
})

test('rejects 00 and country code in national field', () => {
  assert.equal(normalizeOfferPhone('966', '00501234567').ok, false)
  assert.equal(normalizeOfferPhone('1', '15551234567').ok, false)
})

test('US needs 10 digits', () => {
  const phone = normalizeOfferPhone('1', '4155552671')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+14155552671')
  assert.equal(normalizeOfferPhone('1', '415555').ok, false)
})
