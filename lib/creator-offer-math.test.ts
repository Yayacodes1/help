import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TARGET_CPM_USD,
  buildOfferMessage,
  buildOfferTerms,
  likesTier,
  marketFromCountry,
  pricingViewsFromStats,
} from './creator-offer-math.ts'

test('Saudi standard account: 5 SAR / video + 5 SAR / 5k views', () => {
  const terms = buildOfferTerms({
    market: 'saudi',
    likes: 12_000,
    followers: 8_000,
    avgViews: 6_000,
    medianViews: 5_500,
    videoCount: 18,
  })
  assert.equal(terms.currency, 'SAR')
  assert.equal(terms.basePerVideo, 5)
  assert.equal(terms.bonusPerBlock, 5)
  assert.equal(terms.viewsThreshold, 5000)
  assert.equal(terms.pricingViews, 5500)
  assert.equal(terms.weeklyBase, 35)
})

test('US offer targets ~$0.60 CPM using median views', () => {
  assert.equal(DEFAULT_TARGET_CPM_USD, 0.6)
  const terms = buildOfferTerms({
    market: 'us',
    likes: 37_000,
    followers: 22_000,
    avgViews: 3687,
    medianViews: 1200,
    videoCount: 18,
    targetCpmUsd: 0.6,
  })
  assert.equal(terms.currency, 'USD')
  assert.equal(terms.pricingViews, 1200)
  assert.ok(terms.basePerVideo > 0 && terms.basePerVideo <= 1)
  assert.ok(terms.per1kViews != null && terms.per1kViews > 0)
  assert.ok(terms.estimatedCpm != null)
  assert.ok(Math.abs((terms.estimatedCpm ?? 0) - 0.6) < 0.05)
})

test('pricing prefers median over average', () => {
  assert.equal(pricingViewsFromStats(5000, 2000), 2000)
  assert.equal(pricingViewsFromStats(5000, null), 5000)
})

test('likes tiers and country market', () => {
  assert.equal(likesTier(100), 'low')
  assert.equal(likesTier(500), 'standard')
  assert.equal(likesTier(250_000), 'high')
  assert.equal(likesTier(600_000), 'top')
  assert.equal(marketFromCountry('Saudi Arabia'), 'saudi')
  assert.equal(marketFromCountry('United States'), 'us')
})

test('offer message mentions median and approximation', () => {
  const terms = buildOfferTerms({
    market: 'us',
    likes: 20_000,
    followers: 10_000,
    avgViews: 3687,
    medianViews: 1400,
    videoCount: 18,
    targetCpmUsd: 0.6,
  })
  const msg = buildOfferMessage({
    username: 'studywithjames',
    terms,
    avgViews: 3687,
    medianViews: 1400,
    videoCount: 18,
    likes: 20_000,
    audienceCountry: 'United States',
    audienceAge: '18-24',
  })
  assert.match(msg, /Instagram/)
  assert.match(msg, /approximation/i)
  assert.match(msg, /median/i)
  assert.match(msg, /@studywithjames/)
  assert.match(msg, /last 18 videos|recent videos/i)
})
