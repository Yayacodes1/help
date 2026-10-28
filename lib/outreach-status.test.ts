import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanOutreachUsername,
  compareOutreachLeads,
  outreachGreeting,
  outreachStatusLabel,
  parseOutreachCount,
} from './outreach-status.ts'

test('status lines use the negotiator name', () => {
  assert.equal(outreachStatusLabel('open', null), 'Nobody has contacted them')
  assert.equal(outreachStatusLabel('negotiating', 'Lula'), 'Lula is negotiating with them')
  assert.equal(outreachStatusLabel('done', 'Lula'), 'Negotiation done by Lula')
  assert.equal(outreachStatusLabel('passed', 'Lula'), 'Contacted, not closed')
  assert.equal(outreachStatusLabel('closed', 'Lula'), 'Closed · added as a creator')
})

test('a reposter who is also outreach gets both names in the greeting', () => {
  assert.equal(
    outreachGreeting({ name: 'Sami', role: 'outreach', via: 'creator' }),
    'Hey, welcome back, reposter / outreach, Sami',
  )
  assert.equal(
    outreachGreeting({ name: 'Nora', role: 'outreach', via: 'login' }),
    'Hey, welcome back, outreach, Nora',
  )
})

test('both sort adds followers and likes, then breaks ties with followers', () => {
  const bigFollowers = { followers: 90_000, likes: 5_000 }
  const bothHigher = { followers: 80_000, likes: 40_000 }
  const sameScoreMoreFollowers = { followers: 90_000, likes: 30_000 }
  const sameScoreFewerFollowers = { followers: 80_000, likes: 40_000 }
  assert.ok(compareOutreachLeads('both', bothHigher, bigFollowers) < 0)
  assert.ok(compareOutreachLeads('both', sameScoreMoreFollowers, sameScoreFewerFollowers) < 0)
  assert.ok(compareOutreachLeads('followers', bigFollowers, bothHigher) < 0)
  assert.ok(compareOutreachLeads('likes', bothHigher, bigFollowers) < 0)
})

test('counts like 12.4K become integers and usernames drop the @', () => {
  assert.equal(parseOutreachCount('12.4K'), 12400)
  assert.equal(parseOutreachCount(900), 900)
  assert.equal(cleanOutreachUsername('@Hello.World'), 'Hello.World')
  assert.equal(cleanOutreachUsername('https://www.instagram.com/hello/'), 'hello')
})
