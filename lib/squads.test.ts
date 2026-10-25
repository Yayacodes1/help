import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSquad, squadKeyFromName } from './squads.ts'

test('saved squad wins over the leader’s name', () => {
  assert.equal(squadKeyFromName('Ammar', 'Delta'), 'Delta')
  assert.equal(parseSquad('beta'), 'Beta')
})

test('maps the four group leaders by name', () => {
  assert.equal(squadKeyFromName('Ammar'), 'Alpha')
  assert.equal(squadKeyFromName('Amar'), 'Alpha')
  assert.equal(squadKeyFromName('Abdul Kareem'), 'Beta')
  assert.equal(squadKeyFromName('Abdul-Kareem'), 'Beta')
  assert.equal(squadKeyFromName('Abdulkarim'), 'Beta')
  assert.equal(squadKeyFromName('Lina'), 'Charlie')
  assert.equal(squadKeyFromName('Sultan'), 'Delta')
})

test('still matches Alpha–Delta in the leader name', () => {
  assert.equal(squadKeyFromName('Alpha — Ammar'), 'Alpha')
  assert.equal(squadKeyFromName('Group Charlie'), 'Charlie')
})

test('unknown names are unassigned', () => {
  assert.equal(squadKeyFromName('Ahmed'), 'other')
  assert.equal(parseSquad('other'), null)
})
