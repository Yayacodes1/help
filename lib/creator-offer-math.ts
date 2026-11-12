/** Self-serve creator offer pricing (approximation, not a final contract). */

export type OfferMarket = 'saudi' | 'us'

/** Default US-style target effective CPM. */
export const DEFAULT_TARGET_CPM_USD = 0.6

export type OfferInputs = {
  market: OfferMarket
  likes: number | null
  followers: number | null
  /** Prefer median for pricing when available (less skewed by one viral). */
  avgViews: number | null
  medianViews?: number | null
  videoCount: number | null
  /** Target effective CPM for US-style deals. Default $0.60. */
  targetCpmUsd?: number
}

export type OfferTerms = {
  market: OfferMarket
  currency: 'SAR' | 'USD'
  /** Guaranteed pay per posted video (both platforms when required). */
  basePerVideo: number
  /** Views needed for one bonus unit. */
  viewsThreshold: number
  /** Pay per full threshold block. */
  bonusPerBlock: number
  /** Alias: USD pay per 1,000 views when market is US. */
  per1kViews: number | null
  viewsWindowDays: number
  postsPerDay: number
  requireBothPlatforms: boolean
  likesTier: 'low' | 'standard' | 'high' | 'top'
  targetCpm: number | null
  /** Views used for CPM math (median preferred). */
  pricingViews: number | null
  estimatedPayPerVideo: number | null
  estimatedCpm: number | null
  weeklyBase: number
  monthlyBase: number
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function likesTier(likes: number | null): OfferTerms['likesTier'] {
  const n = Math.max(0, Number(likes) || 0)
  if (n >= 500_000) return 'top'
  if (n >= 200_000) return 'high'
  if (n >= 200) return 'standard'
  return 'low'
}

/** Prefer median for offer math; fall back to average. */
export function pricingViewsFromStats(
  avgViews: number | null | undefined,
  medianViews?: number | null,
): number | null {
  if (medianViews != null && medianViews > 0) return medianViews
  if (avgViews != null && avgViews > 0) return avgViews
  return null
}

/**
 * Saudi: ~5 SAR / video + 5 SAR per 5,000 views.
 * Bigger accounts get a higher base.
 * US: small base + per-1k tuned toward target CPM (default $0.60).
 */
export function buildOfferTerms(input: OfferInputs): OfferTerms {
  const tier = likesTier(input.likes)
  const pricingViews = pricingViewsFromStats(input.avgViews, input.medianViews)
  const viewsWindowDays = 7
  const postsPerDay = 1
  const requireBothPlatforms = true

  if (input.market === 'saudi') {
    const basePerVideo = tier === 'top' ? 10 : tier === 'high' ? 8 : 5
    const viewsThreshold = 5000
    const bonusPerBlock = tier === 'top' ? 8 : tier === 'high' ? 6 : 5
    const estimatedPayPerVideo =
      pricingViews == null
        ? null
        : roundMoney(basePerVideo + Math.floor(pricingViews / viewsThreshold) * bonusPerBlock)
    const estimatedCpm =
      pricingViews && estimatedPayPerVideo != null
        ? roundMoney((estimatedPayPerVideo / pricingViews) * 1000)
        : null
    return {
      market: 'saudi',
      currency: 'SAR',
      basePerVideo,
      viewsThreshold,
      bonusPerBlock,
      per1kViews: null,
      viewsWindowDays,
      postsPerDay,
      requireBothPlatforms,
      likesTier: tier,
      targetCpm: null,
      pricingViews,
      estimatedPayPerVideo,
      estimatedCpm,
      weeklyBase: roundMoney(basePerVideo * 7),
      monthlyBase: roundMoney(basePerVideo * 30),
    }
  }

  const targetCpm = Math.max(0.1, Number(input.targetCpmUsd) || DEFAULT_TARGET_CPM_USD)
  // Prefer a small guaranteed base; shrink it when needed so ~$0.60 CPM stays solvable.
  const tierBase = tier === 'top' ? 2 : tier === 'high' ? 1.5 : 1
  let basePerVideo = tierBase
  let per1kViews = roundMoney(targetCpm)
  if (pricingViews && pricingViews > 0) {
    const desiredPay = (targetCpm * pricingViews) / 1000
    // Leave room for at least $0.05 / 1k so the structure stays base + views.
    const maxBaseForTarget = Math.max(0.25, desiredPay - 0.05 * (pricingViews / 1000))
    basePerVideo = roundMoney(Math.min(tierBase, maxBaseForTarget))
    const remaining = Math.max(0, desiredPay - basePerVideo)
    per1kViews = roundMoney(Math.max(0.05, (remaining * 1000) / pricingViews))
  }
  const estimatedPayPerVideo =
    pricingViews == null
      ? null
      : roundMoney(basePerVideo + (pricingViews / 1000) * per1kViews)
  const estimatedCpm =
    pricingViews && estimatedPayPerVideo != null
      ? roundMoney((estimatedPayPerVideo / pricingViews) * 1000)
      : targetCpm

  return {
    market: 'us',
    currency: 'USD',
    basePerVideo,
    viewsThreshold: 1000,
    bonusPerBlock: per1kViews,
    per1kViews,
    viewsWindowDays,
    postsPerDay,
    requireBothPlatforms,
    likesTier: tier,
    targetCpm,
    pricingViews,
    estimatedPayPerVideo,
    estimatedCpm,
    weeklyBase: roundMoney(basePerVideo * 7),
    monthlyBase: roundMoney(basePerVideo * 30),
  }
}

export function marketFromCountry(country: string | null | undefined): OfferMarket {
  const c = (country ?? '').trim().toLowerCase()
  if (!c) return 'us'
  if (
    c === 'sa' ||
    c === 'saudi' ||
    c === 'saudi arabia' ||
    c.includes('saudi') ||
    c === 'ksa' ||
    c === 'ae' ||
    c === 'uae' ||
    c.includes('emirates') ||
    c === 'kw' ||
    c.includes('kuwait') ||
    c === 'bh' ||
    c.includes('bahrain') ||
    c === 'qa' ||
    c.includes('qatar') ||
    c === 'om' ||
    c.includes('oman') ||
    c === 'eg' ||
    c.includes('egypt') ||
    c === 'jo' ||
    c.includes('jordan') ||
    c === 'lb' ||
    c.includes('lebanon') ||
    c === 'iq' ||
    c.includes('iraq') ||
    c === 'ma' ||
    c.includes('morocco') ||
    c === 'dz' ||
    c.includes('algeria') ||
    c === 'tn' ||
    c.includes('tunisia') ||
    c === 'ye' ||
    c.includes('yemen') ||
    c === 'ly' ||
    c.includes('libya') ||
    c === 'ps' ||
    c.includes('palestine') ||
    c === 'sd' ||
    c.includes('sudan')
  ) {
    return 'saudi'
  }
  return 'us'
}

export function buildOfferMessage(input: {
  username: string | null
  terms: OfferTerms
  avgViews: number | null
  medianViews?: number | null
  videoCount: number | null
  likes: number | null
  audienceCountry: string | null
  audienceAge: string | null
  topCountries?: Array<{ country: string; percent: number | null }> | null
  baseCountryLabel?: string | null
}): string {
  const handle = input.username ? `@${input.username.replace(/^@+/, '')}` : 'your account'
  const vidLabel =
    input.videoCount && input.videoCount > 0
      ? `${input.videoCount} recent videos`
      : 'your recent videos'
  const statsBits = [
    input.avgViews != null ? `average ~${Math.round(input.avgViews).toLocaleString()}` : null,
    input.medianViews != null ? `median ~${Math.round(input.medianViews).toLocaleString()}` : null,
  ].filter(Boolean)
  const avgLine =
    statsBits.length > 0
      ? `Views from your last ${input.videoCount ?? 'recent'} videos: ${statsBits.join(', ')}.`
      : 'We estimated pay from the stats we could read.'

  const topCountriesLine =
    input.topCountries && input.topCountries.length > 0
      ? `Top audience countries: ${input.topCountries
          .map((c) => (c.percent != null ? `${c.country} ${c.percent}%` : c.country))
          .join(', ')}.`
      : input.audienceCountry
        ? `Top audience country: ${input.audienceCountry}.`
        : null
  const audienceBits = [
    topCountriesLine,
    input.audienceAge ? `top age ${input.audienceAge}` : null,
    input.baseCountryLabel ? `you’re based in ${input.baseCountryLabel}` : null,
  ].filter(Boolean)
  const audienceLine =
    audienceBits.length > 0 ? `From your analytics / profile: ${audienceBits.join('; ')}.` : null

  if (input.terms.currency === 'SAR') {
    return [
      `Hey! We reviewed ${handle} and looked at ${vidLabel}.`,
      avgLine,
      audienceLine,
      '',
      `We'd love to work with you. Here's an approximate offer (not a final contract):`,
      '',
      `**Posting schedule:**`,
      `- ${input.terms.postsPerDay} video every day.`,
      `- Each video on both TikTok and Instagram.`,
      '',
      `**Payment (SAR):**`,
      `- ${input.terms.basePerVideo} SAR guaranteed per video.`,
      `- An additional ${input.terms.bonusPerBlock} SAR for every ${input.terms.viewsThreshold.toLocaleString()} views on each video.`,
      `- Views counted within the first ${input.terms.viewsWindowDays} days after posting.`,
      '',
      `**Guaranteed base:**`,
      `- ${input.terms.weeklyBase} SAR per week (7 videos).`,
      `- ${input.terms.monthlyBase} SAR per month (30 videos).`,
      '',
      input.terms.estimatedPayPerVideo != null
        ? `At your recent performance, that is about ${input.terms.estimatedPayPerVideo} SAR per video before we settle a final deal.`
        : null,
      '',
      `This is an approximation. If you agree, reply yes and we'll text you on WhatsApp to collect payment details and start a short test week.`,
      '',
      `Let us know if you're interested!`,
    ]
      .filter((line) => line != null)
      .join('\n')
  }

  const pricingLabel =
    input.terms.pricingViews != null
      ? Math.round(input.terms.pricingViews).toLocaleString()
      : null

  return [
    `Hey! We reviewed ${handle} and analyzed ${vidLabel} to understand your average performance.`,
    avgLine,
    audienceLine,
    '',
    `We'd love to work with you. Here's our offer:`,
    '',
    `**Posting schedule:**`,
    `- ${input.terms.postsPerDay} video every day.`,
    `- Each video must be posted on both TikTok and Instagram.`,
    '',
    `**Payment structure:**`,
    `- $${input.terms.basePerVideo} guaranteed per video.`,
    `- An additional $${input.terms.per1kViews} for every 1,000 views achieved by each individual video.`,
    `- Views counted within the first ${input.terms.viewsWindowDays} days after posting.`,
    '',
    `**Guaranteed base payment:**`,
    `- $${input.terms.weeklyBase} per week (7 videos).`,
    `- $${input.terms.monthlyBase} per month (30 videos).`,
    '',
    input.terms.estimatedPayPerVideo != null && input.terms.estimatedCpm != null && pricingLabel
      ? `Using ~${pricingLabel} views for pricing, that's about $${input.terms.estimatedPayPerVideo}/video (~$${input.terms.estimatedCpm} CPM).`
      : `Target effective CPM is about $${input.terms.targetCpm}.`,
    '',
    `View-based bonuses are paid on top of the guaranteed amount.`,
    '',
    `We'd like to start with a one-week test, review the results, then discuss continuing.`,
    '',
    `This is an approximation — not necessarily the final contract. If you agree, reply yes and we'll WhatsApp you next.`,
    '',
    `Let us know if you're interested. We'd love to work together!`,
  ]
    .filter((line) => line != null)
    .join('\n')
}
