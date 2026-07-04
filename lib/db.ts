import { neon } from '@neondatabase/serverless'

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
}

export type Submission = {
  id: number
  creator_id: number
  project_id: number | null
  platform: Platform
  url: string
  video_date: string
  views: number
  created_at: string
}
