'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/admin-auth'
import {
  DEFAULT_TARGET_CPM_USD,
  buildOfferMessage,
  buildOfferTerms,
  marketFromCountry,
  type OfferMarket,
} from '@/lib/creator-offer-math'
import {
  getCreatorOffer,
  insertCreatorOffer,
  listCreatorOffers,
  regenerateCreatorOffer,
  updateCreatorOfferStatus,
  type CreatorOfferStatus,
} from '@/lib/creator-offer-db'
import { OFFER_BASE_COUNTRIES, normalizeOfferPhone } from '@/lib/creator-offer-phone'
import {
  formatTopCountries,
  parseAccountUrl,
  readOfferAnalyticsFrames,
  type AudienceCountryShare,
} from '@/lib/creator-offer-vision'
import {
  OFFER_RECENT_VIDEO_LIMIT,
  fetchOfferProfileStats,
} from '@/lib/creator-offer-tikhub'

export type OfferActionState = {
  ok: boolean
  message: string
  offerId?: number
  messageBody?: string
  termsSummary?: string
  avgViews?: number | null
  medianViews?: number | null
  likes?: number | null
  videoCount?: number | null
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

function parseFrames(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.startsWith('data:image/'))
  } catch {
    return []
  }
}

/** Compensation market follows where the creator says they are based (admin decides rates). */
function resolveMarket(baseCountry: string): OfferMarket {
  if (baseCountry?.trim()) return marketFromCountry(baseCountry)
  return 'us'
}

function baseCountryLabel(value: string): string | null {
  if (!value.trim()) return null
  return OFFER_BASE_COUNTRIES.find((c) => c.value === value)?.label ?? value
}

async function buildOfferFromForm(formData: FormData): Promise<
  | {
      ok: true
      accountUrl: string
      baseCountry: string
      phone: { e164: string; key: string }
      username: string | null
      platform: string | null
      followers: number | null
      likes: number
      avgViews: number
      medianViews: number | null
      videoCount: number
      audienceCountry: string | null
      audienceAge: string | null
      topCountries: AudienceCountryShare[]
      market: OfferMarket
      terms: ReturnType<typeof buildOfferTerms>
      message: string
      frames: string[]
    }
  | { ok: false; message: string; fill?: OfferActionState }
> {
  const accountUrl = (formData.get('account_url') ?? '').toString().trim()
  const baseCountry = (formData.get('base_country') ?? '').toString().trim()
  const dial = (formData.get('phone_dial') ?? '').toString().trim()
  const national = (formData.get('phone_national') ?? '').toString().trim()
  const frames = parseFrames((formData.get('analytics_frames') ?? '').toString())

  const parsedUrl = parseAccountUrl(accountUrl)
  if (!parsedUrl.ok) {
    return { ok: false, message: 'Paste a full TikTok or Instagram profile link.' }
  }
  if (!baseCountry) return { ok: false, message: 'Select a country for where you are based.' }

  const phone = normalizeOfferPhone(dial, national)
  if (!phone.ok) return { ok: false, message: phone.error }

  if (frames.length === 0) {
    return {
      ok: false,
      message:
        'Upload is required. Add a screen recording or screenshots showing audience countries (%) and age.',
    }
  }

  const [vision, tikhub] = await Promise.all([
    readOfferAnalyticsFrames(frames),
    fetchOfferProfileStats({
      platform: parsedUrl.platform,
      username: parsedUrl.username,
      limit: OFFER_RECENT_VIDEO_LIMIT,
    }),
  ])
  if (!vision.ok) return { ok: false, message: vision.error }

  // Prefer TikHub last-10 views; fall back to AI-read overview if the API misses.
  const avgViews = tikhub.ok ? tikhub.avgViews : vision.read.avgViews
  const medianViews = tikhub.ok
    ? tikhub.medianViews
    : (vision.read.medianViews ?? vision.read.avgViews)
  const videoCount = tikhub.ok
    ? tikhub.videoCount
    : (vision.read.videoCount ?? (avgViews != null ? 1 : null))
  const followers = tikhub.ok
    ? (tikhub.followers ?? vision.read.followers)
    : vision.read.followers
  const likes =
    (tikhub.ok ? tikhub.likes : null) ??
    vision.read.likes ??
    followers

  const topCountries = vision.read.topCountries
  const audienceCountry =
    vision.read.audienceCountry ?? topCountries[0]?.country ?? null
  const audienceAge = vision.read.audienceAge

  const fill = {
    avgViews: avgViews ?? null,
    medianViews: medianViews ?? null,
    likes: likes ?? null,
    videoCount: videoCount ?? null,
  }

  if (avgViews == null || avgViews <= 0 || videoCount == null || videoCount <= 0) {
    return {
      ok: false,
      message: tikhub.ok
        ? 'Couldn’t compute views from recent posts. Try again in a moment.'
        : `${tikhub.error} Or show average views clearly in the analytics upload.`,
      fill,
    }
  }
  if (likes == null || likes <= 0) {
    return {
      ok: false,
      message:
        'We couldn’t read likes/followers from the link or upload. Start the recording on your profile, then try again.',
      fill,
    }
  }

  const market = resolveMarket(baseCountry)
  const terms = buildOfferTerms({
    market,
    likes,
    followers,
    avgViews,
    medianViews,
    videoCount,
    targetCpmUsd: DEFAULT_TARGET_CPM_USD,
  })
  const username =
    (tikhub.ok ? tikhub.username : null) ||
    vision.read.username ||
    parsedUrl.username
  const platform =
    (tikhub.ok ? tikhub.platform : null) ||
    (vision.read.platform !== 'unknown' ? vision.read.platform : parsedUrl.platform)
  const message = buildOfferMessage({
    username,
    terms,
    avgViews,
    medianViews,
    videoCount,
    likes,
    audienceCountry: formatTopCountries(topCountries) ?? audienceCountry,
    audienceAge,
    topCountries,
    baseCountryLabel: baseCountryLabel(baseCountry),
  })

  return {
    ok: true,
    accountUrl,
    baseCountry,
    phone: { e164: phone.e164, key: phone.key },
    username,
    platform,
    followers,
    likes,
    avgViews,
    medianViews: medianViews ?? null,
    videoCount,
    audienceCountry,
    audienceAge,
    topCountries,
    market,
    terms,
    message,
    frames,
  }
}

export async function previewCreatorOffer(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const built = await buildOfferFromForm(formData)
  if (!built.ok) {
    return {
      ok: false,
      message: built.message,
      ...(built.fill ?? {}),
    }
  }

  const termsSummary =
    built.terms.currency === 'SAR'
      ? `${built.terms.basePerVideo} SAR / video + ${built.terms.bonusPerBlock} SAR / ${built.terms.viewsThreshold.toLocaleString()} views`
      : `$${built.terms.basePerVideo} / video + $${built.terms.per1kViews} / 1k views · ~$${built.terms.estimatedCpm} CPM (target $${DEFAULT_TARGET_CPM_USD})`

  return {
    ok: true,
    message: 'Offer ready — review it, then submit if you want to continue.',
    messageBody: built.message,
    termsSummary,
    avgViews: built.avgViews,
    medianViews: built.medianViews,
    likes: built.likes,
    videoCount: built.videoCount,
  }
}

export async function submitCreatorOffer(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const interested = (formData.get('interested') ?? '').toString() === '1'
  if (!interested) {
    return { ok: false, message: 'Confirm you’re interested to submit.' }
  }

  const built = await buildOfferFromForm(formData)
  if (!built.ok) {
    return {
      ok: false,
      message: built.message,
      ...(built.fill ?? {}),
    }
  }

  const row = await insertCreatorOffer({
    accountUrl: built.accountUrl,
    username: built.username,
    platform: built.platform,
    baseCountry: built.baseCountry,
    whatsappPhone: built.phone.e164,
    whatsappKey: built.phone.key,
    followers: built.followers,
    likes: built.likes,
    avgViews: built.avgViews,
    medianViews: built.medianViews,
    videoCount: built.videoCount,
    audienceCountry: built.audienceCountry,
    audienceAge: built.audienceAge,
    audienceCountries: built.topCountries,
    analyticsOk: true,
    market: built.market,
    targetCpm: built.terms.targetCpm,
    currency: built.terms.currency,
    terms: built.terms,
    offerMessage: built.message,
    frameImages: built.frames.slice(0, 3),
  })

  revalidatePath('/admin')
  return {
    ok: true,
    message:
      'Submitted. We’ll WhatsApp you next if we move forward. Keep an eye on your messages.',
    offerId: row.id,
  }
}

export async function adminListCreatorOffers() {
  await requireAdmin()
  return listCreatorOffers(100)
}

export async function adminSetCreatorOfferStatus(id: number, status: CreatorOfferStatus) {
  await requireAdmin()
  const row = await updateCreatorOfferStatus(id, status)
  revalidatePath('/admin')
  return row
}

export async function adminRegenerateCreatorOffer(id: number, targetCpmRaw: string) {
  await requireAdmin()
  const existing = await getCreatorOffer(id)
  if (!existing) return { ok: false as const, message: 'Offer not found.' }

  const targetCpm = Number(targetCpmRaw)
  if (!Number.isFinite(targetCpm) || targetCpm <= 0) {
    return { ok: false as const, message: 'Enter a positive CPM.' }
  }

  const market = existing.market === 'saudi' ? 'saudi' : resolveMarket(existing.baseCountry)
  const terms = buildOfferTerms({
    market,
    likes: existing.likes,
    followers: existing.followers,
    avgViews: existing.avgViews,
    medianViews: existing.medianViews,
    videoCount: existing.videoCount,
    targetCpmUsd: market === 'us' ? targetCpm : undefined,
  })

  const message = buildOfferMessage({
    username: existing.username,
    terms,
    avgViews: existing.avgViews,
    medianViews: existing.medianViews,
    videoCount: existing.videoCount,
    likes: existing.likes,
    audienceCountry: existing.audienceCountry,
    audienceAge: existing.audienceAge,
    topCountries: existing.audienceCountries,
    baseCountryLabel: baseCountryLabel(existing.baseCountry),
  })

  const row = await regenerateCreatorOffer(id, {
    targetCpm: market === 'us' ? targetCpm : existing.targetCpm,
    terms,
    offerMessage: message,
    market,
    currency: terms.currency,
  })

  revalidatePath('/admin')
  return { ok: true as const, row }
}

export async function adminWhatsAppCreatorOffer(id: number) {
  await requireAdmin()
  const row = await getCreatorOffer(id)
  if (!row) return { ok: false as const, message: 'Offer not found.' }
  const digits = row.whatsappPhone.replace(/\D/g, '')
  if (!digits) return { ok: false as const, message: 'No WhatsApp number on this offer.' }
  const body = `${row.offerMessage}\n\nIf you agree, reply YES and send your payment details.`
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
  if (row.status === 'submitted') {
    await updateCreatorOfferStatus(id, 'reviewing')
  }
  revalidatePath('/admin')
  return { ok: true as const, url }
}
