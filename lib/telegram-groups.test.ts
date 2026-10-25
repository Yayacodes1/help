import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  groupLeaderButtons,
  parseReportSquad,
  peopleInSquad,
  personIdsForSquad,
  squadCallbackToken,
  squadMenuTitle,
  squadRoleButtons,
} from './telegram-groups.ts'
import type { AttendancePerson } from './attendance-types.ts'

function person(id: number, name: string, role: AttendancePerson['role']): AttendancePerson {
  return {
    id,
    name,
    role,
    status: 'miss',
    todayInstagram: 0,
    todayTiktok: 0,
    goalInstagram: 1,
    goalTiktok: 1,
    missStreak: 0,
    contractStrikes: 0,
    maxStrikes: 3,
    contractId: null,
    contractName: null,
  }
}

const board = {
  leaders: [
    {
      name: 'Ammar',
      squad: 'Alpha' as const,
      people: [{ id: 10 }, { id: 11 }],
    },
    {
      name: 'Abdul Kareem',
      squad: null,
      people: [{ id: 20 }],
    },
  ],
  unassigned: { people: [{ id: 30 }] },
}

test('callback tokens and titles for the four groups', () => {
  assert.equal(parseReportSquad('Alpha'), 'Alpha')
  assert.equal(parseReportSquad('none'), 'ungrouped')
  assert.equal(squadCallbackToken('ungrouped'), 'none')
  assert.equal(squadMenuTitle('Alpha'), 'Alpha · Ammar')
  assert.equal(squadMenuTitle('Beta'), 'Beta · Abdul Kareem')
  assert.equal(squadMenuTitle('Charlie'), 'Charlie · Lina')
  assert.equal(squadMenuTitle('Delta'), 'Delta · Sultan')
  assert.equal(squadMenuTitle('ungrouped'), 'Ungrouped')
})

test('Ammar maps to Alpha people; Abdul Kareem maps by name when squad is unset', () => {
  assert.deepEqual([...personIdsForSquad(board, 'Alpha')].sort(), [10, 11])
  assert.deepEqual([...personIdsForSquad(board, 'Beta')], [20])
  assert.deepEqual([...personIdsForSquad(board, 'Charlie')], [])
  assert.deepEqual([...personIdsForSquad(board, 'ungrouped')], [30])
})

test('filters creators vs reposters inside a group', () => {
  const everyone = [
    person(10, 'Sara', 'creator'),
    person(11, 'Nour', 'reposter'),
    person(20, 'Huda', 'creator'),
    person(30, 'Free', 'creator'),
  ]
  assert.deepEqual(
    peopleInSquad(everyone, board, 'Alpha', 'creator').map((p) => p.name),
    ['Sara'],
  )
  assert.deepEqual(
    peopleInSquad(everyone, board, 'Alpha', 'reposter').map((p) => p.name),
    ['Nour'],
  )
  assert.deepEqual(
    peopleInSquad(everyone, board, 'ungrouped', 'creator').map((p) => p.name),
    ['Free'],
  )
})

test('group leader buttons name each squad and its leader', () => {
  const rows = groupLeaderButtons('live').inline_keyboard
  assert.equal(rows[0][0].text, 'Alpha · Ammar')
  assert.equal(rows[0][0].callback_data, 'sq:Alpha:live')
  assert.equal(rows[0][1].text, 'Beta · Abdul Kareem')
  assert.equal(rows[1][0].text, 'Charlie · Lina')
  assert.equal(rows[1][1].text, 'Delta · Sultan')
  assert.equal(rows[2][0].callback_data, 'sq:none:live')
  const roles = squadRoleButtons('Alpha', 'live').inline_keyboard
  assert.equal(roles[0][0].text, '📊 Update')
  assert.equal(roles[0][0].callback_data, 'squ:Alpha:live')
  assert.equal(roles[0][1].text, '📋 List')
  assert.equal(roles[0][1].callback_data, 'sql:Alpha:live')
  assert.equal(roles[1][0].text, '✉️ Creators reminder')
  assert.equal(roles[1][0].callback_data, 'sqm:Alpha:creator:live')
  assert.equal(roles[1][1].text, '✉️ Reposter reminder')
  assert.equal(roles[1][1].callback_data, 'sqm:Alpha:reposter:live')
  assert.equal(roles[2][0].text, '← Groups')
  assert.equal(roles[2][0].callback_data, 'gl:live')
})
