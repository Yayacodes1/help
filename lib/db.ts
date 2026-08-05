import { neon } from '@neondatabase/serverless'
import type { PlatformsMode } from '@/lib/platforms-mode'

export type { PlatformsMode }

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

// Tagged-template SQL client. Interpolated values are sent as parameters,
// which protects against SQL injection.
export const sql = neon(process.env.DATABASE_URL)

export type Project = {
  id: number
  name: string
  created_at: string
}

export const PLATFORMS = ['instagram', 'tiktok'] as const
export type Platform = (typeof PLATFORMS)[number]

export type Creator = {
  id: number
  name: string
  token: string
  project_id: number | null
  created_at: string
  goal_instagram: number
  goal_tiktok: number
  /** Default platforms when a contract does not override */
  platforms: PlatformsMode
  contract_start: string | null
  contract_end: string | null
  last_paid_at: string | null
  pay_every_days: number
  notes: string | null
}

export type Submission = {
  id: number
  creator_id: number
  project_id: number | null
  platform: Platform
  url: string
  video_date: string
  views: number
  /** Last TikHub/views lookup error; null when last fetch succeeded or never tried. */
  views_error: string | null
  created_at: string
}

export type Contract = {
  id: number
  creator_id: number
  name: string
  start_date: string
  end_date: string | null
  created_at: string
  /** Daily Instagram goal for this contract period */
  goal_instagram: number
  /** Daily TikTok goal for this contract period */
  goal_tiktok: number
  /** Total Instagram videos required over the whole contract */
  target_instagram: number
  /** Total TikTok videos required over the whole contract */
  target_tiktok: number
  /** Platforms this contract requires */
  platforms: PlatformsMode
  /** Base pay for this contract period */
  base_amount: number
  /** Commission (nullable until set later) */
  commission_amount: number | null
}

export type Payment = {
  id: number
  creator_id: number
  contract_id: number | null
  paid_on: string
  amount: number
  note: string | null
  created_at: string
}
