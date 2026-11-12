import 'server-only'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const countryShareSchema = z.object({
  country: z.string(),
  percent: z.union([z.number(), z.string()]).nullable().optional(),
})

const analyticsSchema = z.object({
  audienceCountry: z.string().nullable().optional(),
  audienceAge: z.string().nullable().optional(),
  topCountries: z.array(countryShareSchema).optional(),
  likes: z.union([z.number(), z.string()]).nullable().optional(),
  followers: z.union([z.number(), z.string()]).nullable().optional(),
  avgViews: z.union([z.number(), z.string()]).nullable().optional(),
  avgViews30d: z.union([z.number(), z.string()]).nullable().optional(),
  avgViews365d: z.union([z.number(), z.string()]).nullable().optional(),
  medianViews: z.union([z.number(), z.string()]).nullable().optional(),
  videoViews: z.array(z.union([z.number(), z.string()])).optional(),
  videoCount: z.union([z.number(), z.string()]).nullable().optional(),
  username: z.string().nullable().optional(),
  usernameVisible: z.boolean().optional(),
  showed30d: z.boolean().optional(),
  showed365d: z.boolean().optional(),
  platform: z.enum(['instagram', 'tiktok', 'unknown']).optional(),
  hasCountry: z.boolean().optional(),
  hasAge: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export type AudienceCountryShare = {
  country: string
  percent: number | null
}

export type AnalyticsRead = {
  audienceCountry: string | null
  audienceAge: string | null
  topCountries: AudienceCountryShare[]
  likes: number | null
  followers: number | null
  avgViews: number | null
  medianViews: number | null
  videoCount: number | null
  username: string | null
  platform: 'instagram' | 'tiktok' | 'unknown'
  analyticsOk: boolean
  notes: string | null
}

function getModel() {
  if (process.env.OPENAI_API_KEY) return openai('gpt-4o-mini')
  if (process.env.AI_GATEWAY_API_KEY) return 'openai/gpt-4o-mini' as const
  return null
}

function parseDataUrl(value: string): { mediaType: string; bytes: Uint8Array } | null {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null
  const mediaType = match[1].toLowerCase()
  const base64 = match[2].replace(/\s/g, '')
  if (base64.length < 80 || base64.length > 2_400_000) return null
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
  if (bytes.byteLength < 60 || bytes.byteLength > 1_800_000) return null
  return { mediaType, bytes }
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(fenced?.[1]?.trim() || trimmed)
}

function parseCount(value: number | string | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
  }
  const raw = value.trim().toLowerCase().replace(/,/g, '')
  const m = raw.match(/^([\d.]+)\s*([kmb])?$/)
  if (!m) {
    const n = Number(raw.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? Math.round(n) : null
  }
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const mult = m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : m[2] === 'b' ? 1_000_000_000 : 1
  return Math.round(n * mult)
}

function parsePercent(value: number | string | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    // Accept 0.42 or 42
    const pct = value <= 1 ? value * 100 : value
    return Math.round(pct * 10) / 10
  }
  const raw = value.trim().replace(/%/g, '').replace(/,/g, '')
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  const pct = n <= 1 && !String(value).includes('%') ? n * 100 : n
  return Math.round(pct * 10) / 10
}

function cleanUsername(value: string | null | undefined): string | null {
  if (!value) return null
  const u = value.trim().replace(/^@+/, '').replace(/\s+/g, '')
  return u.length >= 2 ? u.slice(0, 64) : null
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
}

export function formatTopCountries(top: AudienceCountryShare[]): string | null {
  if (top.length === 0) return null
  return top
    .map((c) => (c.percent != null ? `${c.country} (${c.percent}%)` : c.country))
    .join(', ')
}

/**
 * Read analytics frames for audience (top countries + age).
 * View performance is preferably filled from TikHub via the profile link.
 */
export async function readOfferAnalyticsFrames(
  frames: string[],
): Promise<{ ok: true; read: AnalyticsRead } | { ok: false; error: string }> {
  const parsedFrames = frames.map(parseDataUrl).filter(Boolean) as Array<{
    mediaType: string
    bytes: Uint8Array
  }>
  if (parsedFrames.length === 0) {
    return {
      ok: false,
      error:
        'Upload a screen recording or screenshots: profile username, then audience countries (with %) and age.',
    }
  }
  if (parsedFrames.length > 8) {
    return { ok: false, error: 'Too many frames — use a shorter recording or fewer screenshots.' }
  }

  const model = getModel()
  if (!model) {
    return {
      ok: false,
      error: 'Reading analytics is unavailable right now. Try again in a moment.',
    }
  }

  let text = ''
  try {
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You read TikTok or Instagram creator analytics screenshots / screen-recording frames for a paid posting offer.

Focus on AUDIENCE from Followers / Audience screens:
- Top countries with percentage shares (bars, maps, ranked lists)
- Top age group / age bands

Also note username, followers/likes if on screen, and any average views labels (optional — we often get views from the profile API separately).

Extract:
- topCountries: up to 3 objects { "country": string, "percent": number|null } ordered by share (highest first). percent as 0–100 (e.g. 42.5 for 42.5%).
- audienceCountry = topCountries[0].country when present
- audienceAge = largest age band (e.g. "18-24")
- username without @; usernameVisible when clearly shown
- platform tiktok|instagram|unknown
- followers / likes when visible
- avgViews / avgViews30d / avgViews365d / videoViews only if clearly on screen
- notes = short note on what was readable

Convert K/M to integers. Use null when missing.

Reply JSON only:
{"topCountries":[{"country":string,"percent":number|null}],"audienceCountry":string|null,"audienceAge":string|null,"likes":number|null,"followers":number|null,"avgViews":number|null,"avgViews30d":number|null,"avgViews365d":number|null,"medianViews":number|null,"videoViews":number[],"videoCount":number|null,"username":string|null,"usernameVisible":boolean,"showed30d":boolean,"showed365d":boolean,"platform":"instagram"|"tiktok"|"unknown","hasCountry":boolean,"hasAge":boolean,"notes":string|null}`,
            },
            ...parsedFrames.map((frame) => ({
              type: 'image' as const,
              image: frame.bytes,
              mediaType: frame.mediaType,
            })),
          ],
        },
      ],
    })
    text = result.text
  } catch {
    return {
      ok: false,
      error:
        'Could not read those frames. Record again with audience countries (%) and age clearly visible.',
    }
  }

  let parsed: z.infer<typeof analyticsSchema>
  try {
    parsed = analyticsSchema.parse(parseJson(text))
  } catch {
    return {
      ok: false,
      error: 'Could not understand the analytics screens. Try a clearer recording.',
    }
  }

  const topCountries: AudienceCountryShare[] = (parsed.topCountries ?? [])
    .map((row) => {
      const country = (row.country ?? '').trim()
      if (!country) return null
      return { country, percent: parsePercent(row.percent ?? null) }
    })
    .filter((row): row is AudienceCountryShare => row != null)
    .slice(0, 3)

  const audienceCountry =
    (parsed.audienceCountry ?? '').trim() || topCountries[0]?.country || null
  const audienceAge = (parsed.audienceAge ?? '').trim() || null

  const fromList = (parsed.videoViews ?? [])
    .map((v) => parseCount(v))
    .filter((n): n is number => n != null && n >= 0)
  const avgFromList = averageOf(fromList)
  const medianFromList = medianOf(fromList)
  const avg30 = parseCount(parsed.avgViews30d)
  const avg365 = parseCount(parsed.avgViews365d)
  const avgViews =
    parseCount(parsed.avgViews) ?? avg365 ?? avg30 ?? avgFromList
  const medianViews = parseCount(parsed.medianViews) ?? medianFromList ?? avgViews
  const videoCount =
    parseCount(parsed.videoCount) ?? (fromList.length > 0 ? fromList.length : null)

  return {
    ok: true,
    read: {
      audienceCountry,
      audienceAge,
      topCountries,
      likes: parseCount(parsed.likes),
      followers: parseCount(parsed.followers),
      avgViews,
      medianViews,
      videoCount,
      username: cleanUsername(parsed.username),
      platform:
        parsed.platform === 'instagram' || parsed.platform === 'tiktok'
          ? parsed.platform
          : 'unknown',
      analyticsOk: true,
      notes: [
        parsed.notes ?? null,
        topCountries.length > 0 ? `top3=${formatTopCountries(topCountries)}` : 'audience_countries_unclear',
        audienceAge ? null : 'audience_age_unclear',
        parsed.usernameVisible ? 'username_visible' : null,
      ]
        .filter(Boolean)
        .join(' | '),
    },
  }
}

/** Pull username / platform from a profile URL when vision doesn’t see them. */
export function parseAccountUrl(url: string): {
  username: string | null
  platform: 'instagram' | 'tiktok' | 'unknown'
  ok: boolean
} {
  const raw = url.trim()
  if (!raw) return { username: null, platform: 'unknown', ok: false }
  let href = raw
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`
  try {
    const u = new URL(href)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host.includes('tiktok.com')) {
      const m = u.pathname.match(/@([^/?#]+)/)
      return { username: m?.[1] ?? null, platform: 'tiktok', ok: Boolean(m?.[1]) }
    }
    if (host.includes('instagram.com')) {
      const parts = u.pathname.split('/').filter(Boolean)
      const skip = new Set(['reel', 'reels', 'p', 'stories', 'explore'])
      const name = parts.find((p) => !skip.has(p.toLowerCase()))
      return { username: name ?? null, platform: 'instagram', ok: Boolean(name) }
    }
    return { username: null, platform: 'unknown', ok: false }
  } catch {
    return { username: null, platform: 'unknown', ok: false }
  }
}
