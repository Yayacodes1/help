import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeOutreachPhone, outreachPhonesMatch } from './saudi-phone.ts'

test('05 local numbers become +966', () => {
  const phone = normalizeOutreachPhone('0501234567')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+966501234567')
  assert.equal(phone.saudi, true)
})

test('spaces, 966, and a pasted plus sign are the same Saudi number', () => {
  const local = normalizeOutreachPhone('050 123 4567')
  const intl = normalizeOutreachPhone('+966 50 123 4567')
  const compact = normalizeOutreachPhone('966501234567')
  const droppedZero = normalizeOutreachPhone('501234567')
  assert.equal(local.ok && intl.ok && compact.ok && droppedZero.ok, true)
  if (!local.ok || !intl.ok || !compact.ok || !droppedZero.ok) return
  assert.equal(local.key, intl.key)
  assert.equal(compact.key, droppedZero.key)
  assert.equal(local.key, '966501234567')
})

test('an extra 0 after 966 is cut', () => {
  const phone = normalizeOutreachPhone('+9660501234567')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+966501234567')
})

test('Arabic-Indic digits are read as a Saudi mobile', () => {
  const phone = normalizeOutreachPhone('٠٥٠١٢٣٤٥٦٧')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+966501234567')
})

test('a full non-Saudi number is kept when it starts with +', () => {
  const phone = normalizeOutreachPhone('+14155552671')
  assert.equal(phone.ok, true)
  if (!phone.ok) return
  assert.equal(phone.e164, '+14155552671')
  assert.equal(phone.saudi, false)
})

test('the chat number and the pasted number must match', () => {
  assert.equal(outreachPhonesMatch('0501234567', '+966 501234567'), true)
  assert.equal(outreachPhonesMatch('0501234567', '0509999999'), false)
})
