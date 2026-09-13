import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'

/** Length of each streak period. */
export const STREAK_EPOCH_DAYS = 30

/** Bump to force a one-time epoch reset on deploy. */
const STREAK_RESET_VERSION = 1

export type StreakEpoch = {
  start: string
  /** Inclusive last day of the period (start + 29). */
  end: string
  days: number
}

function epochEnd(start: string, days: number = STREAK_EPOCH_DAYS): string {
  return addDays(start, days - 1)
}

function advanceEpochStart(start: string, today: string, days: number): string {
  let next = start
  // Roll forward in 30-day steps until today falls inside [next, next+days-1].
  while (today > epochEnd(next, days)) {
    next = addDays(next, days)
  }
  return next
}

export async function ensureStreakSettingsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS streak_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      epoch_start DATE NOT NULL,
      epoch_days INTEGER NOT NULL DEFAULT 30,
      reset_version INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE streak_settings ADD COLUMN IF NOT EXISTS reset_version INTEGER NOT NULL DEFAULT 0`
  await sql`
    INSERT INTO streak_settings (id, epoch_start, epoch_days, reset_version)
    VALUES (1, CURRENT_DATE, ${STREAK_EPOCH_DAYS}, 0)
    ON CONFLICT (id) DO NOTHING
  `
}

/**
 * Resolve the active streak epoch for `today`.
 * - One-time reset to today when STREAK_RESET_VERSION bumps.
 * - Auto-advances every STREAK_EPOCH_DAYS so streaks restart on a fresh window.
 */
export async function ensureStreakEpoch(today: string): Promise<StreakEpoch> {
  await ensureStreakSettingsTable()

  const rows = (await sql`
    SELECT epoch_start::text AS epoch_start,
           epoch_days::int AS epoch_days,
           reset_version::int AS reset_version
    FROM streak_settings
    WHERE id = 1
    LIMIT 1
  `) as { epoch_start: string; epoch_days: number; reset_version: number }[]

  let start = rows[0]?.epoch_start ?? today
  let days =
    rows[0]?.epoch_days && rows[0].epoch_days > 0
      ? rows[0].epoch_days
      : STREAK_EPOCH_DAYS
  const resetVersion = rows[0]?.reset_version ?? 0

  let dirty = false
  if (resetVersion < STREAK_RESET_VERSION) {
    start = today
    days = STREAK_EPOCH_DAYS
    dirty = true
  }

  const advanced = advanceEpochStart(start, today, days)
  if (advanced !== start) {
    start = advanced
    dirty = true
  }

  if (dirty) {
    await sql`
      UPDATE streak_settings
      SET epoch_start = ${start}::date,
          epoch_days = ${days},
          reset_version = ${STREAK_RESET_VERSION},
          updated_at = NOW()
      WHERE id = 1
    `
  }

  return {
    start,
    end: epochEnd(start, days),
    days,
  }
}

/**
 * Previous closed period: the 30 days before the current epoch.
 * Leave the first day out when scoring streaks for that period.
 */
export function previousEpochWindow(
  currentStart: string,
  days: number = STREAK_EPOCH_DAYS,
): {
  start: string
  end: string
  /** First day that counts toward streak (day 1 of the period left out). */
  streakFrom: string
} {
  const start = addDays(currentStart, -days)
  const end = addDays(currentStart, -1)
  return {
    start,
    end,
    streakFrom: addDays(start, 1),
  }
}
