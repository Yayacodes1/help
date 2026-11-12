import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import type { OfferMarket, OfferTerms } from '@/lib/creator-offer-math'

export type CreatorOfferStatus =
  | 'submitted'
  | 'reviewing'
  | 'interested'
  | 'passed'
  | 'hired'

export type CreatorOfferRow = {
  id: number
  accountUrl: string
  username: string | null
  platform: string | null
  baseCountry: string
  whatsappPhone: string
  whatsappKey: string
  followers: number | null
  likes: number | null
  avgViews: number | null
  medianViews: number | null
  videoCount: number | null
  audienceCountry: string | null
  audienceAge: string | null
  audienceCountries: Array<{ country: string; percent: number | null }>
  analyticsOk: boolean
  market: OfferMarket
  targetCpm: number | null
  currency: string
  termsJson: OfferTerms
  offerMessage: string
  status: CreatorOfferStatus
  adminNote: string | null
  frameImages: string[]
  createdAt: string
  updatedAt: string
}

export async function ensureCreatorOfferTables() {
  return ensureOnce('creator-offers', runEnsureCreatorOfferTables)
}

async function runEnsureCreatorOfferTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS creator_offers (
      id SERIAL PRIMARY KEY,
      account_url TEXT NOT NULL,
      username TEXT,
      platform TEXT,
      base_country TEXT NOT NULL,
      whatsapp_phone TEXT NOT NULL,
      whatsapp_key TEXT NOT NULL,
      followers INTEGER,
      likes INTEGER,
      avg_views DOUBLE PRECISION,
      video_count INTEGER,
      audience_country TEXT,
      audience_age TEXT,
      analytics_ok BOOLEAN NOT NULL DEFAULT false,
      market TEXT NOT NULL,
      target_cpm DOUBLE PRECISION,
      currency TEXT NOT NULL,
      terms_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      offer_message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      admin_note TEXT,
      frame_images JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS creator_offers_status_idx
    ON creator_offers (status, created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS creator_offers_whatsapp_key_idx
    ON creator_offers (whatsapp_key)
  `
  await sql`ALTER TABLE creator_offers ADD COLUMN IF NOT EXISTS median_views DOUBLE PRECISION`
  await sql`ALTER TABLE creator_offers ADD COLUMN IF NOT EXISTS audience_countries JSONB NOT NULL DEFAULT '[]'::jsonb`
}

function asStatus(value: string): CreatorOfferStatus {
  if (
    value === 'reviewing' ||
    value === 'interested' ||
    value === 'passed' ||
    value === 'hired'
  ) {
    return value
  }
  return 'submitted'
}

function mapRow(row: Record<string, unknown>): CreatorOfferRow {
  const terms =
    typeof row.terms_json === 'string'
      ? (JSON.parse(row.terms_json) as OfferTerms)
      : (row.terms_json as OfferTerms)
  const frames = Array.isArray(row.frame_images)
    ? (row.frame_images as string[])
    : typeof row.frame_images === 'string'
      ? (JSON.parse(row.frame_images) as string[])
      : []
  return {
    id: Number(row.id),
    accountUrl: String(row.account_url),
    username: row.username != null ? String(row.username) : null,
    platform: row.platform != null ? String(row.platform) : null,
    baseCountry: String(row.base_country),
    whatsappPhone: String(row.whatsapp_phone),
    whatsappKey: String(row.whatsapp_key),
    followers: row.followers == null ? null : Number(row.followers),
    likes: row.likes == null ? null : Number(row.likes),
    avgViews: row.avg_views == null ? null : Number(row.avg_views),
    medianViews: row.median_views == null ? null : Number(row.median_views),
    videoCount: row.video_count == null ? null : Number(row.video_count),
    audienceCountry: row.audience_country != null ? String(row.audience_country) : null,
    audienceAge: row.audience_age != null ? String(row.audience_age) : null,
    audienceCountries: (() => {
      const raw = row.audience_countries
      const parsed =
        typeof raw === 'string'
          ? (JSON.parse(raw) as unknown)
          : Array.isArray(raw)
            ? raw
            : []
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const country = String((item as { country?: unknown }).country ?? '').trim()
          if (!country) return null
          const percentRaw = (item as { percent?: unknown }).percent
          const percent =
            typeof percentRaw === 'number' && Number.isFinite(percentRaw) ? percentRaw : null
          return { country, percent }
        })
        .filter((item): item is { country: string; percent: number | null } => item != null)
    })(),
    analyticsOk: Boolean(row.analytics_ok),
    market: row.market === 'saudi' ? 'saudi' : 'us',
    targetCpm: row.target_cpm == null ? null : Number(row.target_cpm),
    currency: String(row.currency),
    termsJson: terms,
    offerMessage: String(row.offer_message),
    status: asStatus(String(row.status)),
    adminNote: row.admin_note != null ? String(row.admin_note) : null,
    frameImages: frames,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function insertCreatorOffer(input: {
  accountUrl: string
  username: string | null
  platform: string | null
  baseCountry: string
  whatsappPhone: string
  whatsappKey: string
  followers: number | null
  likes: number | null
  avgViews: number | null
  medianViews: number | null
  videoCount: number | null
  audienceCountry: string | null
  audienceAge: string | null
  audienceCountries?: Array<{ country: string; percent: number | null }>
  analyticsOk: boolean
  market: OfferMarket
  targetCpm: number | null
  currency: string
  terms: OfferTerms
  offerMessage: string
  frameImages: string[]
}): Promise<CreatorOfferRow> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    INSERT INTO creator_offers (
      account_url, username, platform, base_country,
      whatsapp_phone, whatsapp_key,
      followers, likes, avg_views, median_views, video_count,
      audience_country, audience_age, audience_countries, analytics_ok,
      market, target_cpm, currency, terms_json, offer_message,
      frame_images
    )
    VALUES (
      ${input.accountUrl}, ${input.username}, ${input.platform}, ${input.baseCountry},
      ${input.whatsappPhone}, ${input.whatsappKey},
      ${input.followers}, ${input.likes}, ${input.avgViews}, ${input.medianViews}, ${input.videoCount},
      ${input.audienceCountry}, ${input.audienceAge},
      ${JSON.stringify(input.audienceCountries ?? [])}::jsonb, ${input.analyticsOk},
      ${input.market}, ${input.targetCpm}, ${input.currency},
      ${JSON.stringify(input.terms)}::jsonb, ${input.offerMessage},
      ${JSON.stringify(input.frameImages)}::jsonb
    )
    RETURNING *
  `) as Record<string, unknown>[]
  return mapRow(rows[0])
}

export async function listCreatorOffers(limit = 80): Promise<CreatorOfferRow[]> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    SELECT *
    FROM creator_offers
    ORDER BY created_at DESC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  `) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function getCreatorOffer(id: number): Promise<CreatorOfferRow | null> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    SELECT * FROM creator_offers WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function updateCreatorOfferStatus(
  id: number,
  status: CreatorOfferStatus,
): Promise<CreatorOfferRow | null> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    UPDATE creator_offers
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function regenerateCreatorOffer(
  id: number,
  input: {
    targetCpm: number | null
    terms: OfferTerms
    offerMessage: string
    market: OfferMarket
    currency: string
  },
): Promise<CreatorOfferRow | null> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    UPDATE creator_offers
    SET target_cpm = ${input.targetCpm},
        terms_json = ${JSON.stringify(input.terms)}::jsonb,
        offer_message = ${input.offerMessage},
        market = ${input.market},
        currency = ${input.currency},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function countOpenCreatorOffers(): Promise<number> {
  await ensureCreatorOfferTables()
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM creator_offers
    WHERE status IN ('submitted', 'reviewing', 'interested')
  `) as { n: number }[]
  return rows[0]?.n ?? 0
}
