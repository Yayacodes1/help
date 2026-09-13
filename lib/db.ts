import { neon } from '@neondatabase/serverless'
import type { PlatformsMode } from '@/lib/platforms-mode'
import type { ParticipantRole } from '@/lib/participant-role'

export type { PlatformsMode, ParticipantRole }

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
  /** creator = content creators; reposter = repost / share accounts */
  role: ParticipantRole
  goal_instagram: number
  goal_tiktok: number
  /** Default platforms when a contract does not override */
  platforms: PlatformsMode
  contract_start: string | null
  contract_end: string | null
  last_paid_at: string | null
  pay_every_days: number
  notes: string | null
  tiktok_username: string | null
  instagram_username: string | null
  /** Which social handle they log in with and that appears on the ranking. */
  login_platform: Platform
}

export type StrikeSource = 'auto' | 'manual'
export type StrikeStatus = 'active' | 'waived'

export type CreatorStrike = {
  id: number
  creator_id: number
  contract_id: number | null
  strike_date: string
  source: StrikeSource
  status: StrikeStatus
  reason: string | null
  created_at: string
}

export type ScheduleBreak = {
  id: number
  creator_id: number
  start_date: string
  end_date: string
  reason: string | null
  days_added: number
  extended_contract_id: number | null
  created_at: string
}

export type CountMode = 'video' | 'batch'

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
  /** Same-content IG+TikTok pair. Null = counted as its own unit. */
  batch_id: string | null
  /** 1-based batch number shown to the creator. */
  batch_index: number | null
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
  /**
   * How to read base_amount:
   * - monthly: full period pay (halves = half each)
   * - biweekly: pay per 14-day wave (month contract = 2×)
   */
  base_pay_cadence: 'monthly' | 'biweekly'
  /** Commission (nullable until set later) */
  commission_amount: number | null
  /** Null = use house default */
  count_mode: CountMode | null
  views_threshold: number | null
  view_commission_amount: number | null
  commission_reels: number | null
}

export type CommissionSettings = {
  views_threshold: number
  commission_amount: number
  reel_count: number
  count_mode: CountMode
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
