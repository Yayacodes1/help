import 'server-only'
import { sql } from '@/lib/db'
import { lastCompletedStreak } from '@/lib/consistency'
import {
  contractWindow,
  getActiveContract,
  getConsistencyForWindow,
  getCreatorById,
  getCreatorConsistency,
  getServerToday,
  goalsForContract,
} from '@/lib/queries'
import { scheduleFromContract } from '@/lib/posting-schedule'

export type StreakRestoreState = {
  streakCarry: number
  streakResumeOn: string | null
}

export async function getStreakRestoreState(
  creatorId: number,
): Promise<StreakRestoreState> {
  const rows = (await sql`
    SELECT COALESCE(streak_carry, 0)::int AS streak_carry,
           streak_resume_on::text AS streak_resume_on
    FROM creators
    WHERE id = ${creatorId}
    LIMIT 1
  `) as { streak_carry: number; streak_resume_on: string | null }[]
  return {
    streakCarry: rows[0]?.streak_carry ?? 0,
    streakResumeOn: rows[0]?.streak_resume_on ?? null,
  }
}

export async function previousContractStart(
  creatorId: number,
  windowStart: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT start_date::text AS start_date
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date < ${windowStart}::date
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { start_date: string }[]
  return rows[0]?.start_date ?? null
}

export async function restoreCreatorStreak(
  creatorId: number,
  today?: string,
): Promise<{ restored: number; changed: boolean }> {
  const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
  await ensureCreatorTrackingColumns()
  const creator = await getCreatorById(creatorId)
  if (!creator) return { restored: 0, changed: false }
  const day = today ?? (await getServerToday())
  const active = await getActiveContract(creator.id, day)
  const window = contractWindow(creator, day, active)
  const prevStart = await previousContractStart(creator.id, window.start)
  const fetchStart =
    prevStart && prevStart < window.start ? prevStart : window.start
  const restore = await getStreakRestoreState(creator.id)
  const [displayed, summary] = await Promise.all([
    getCreatorConsistency(creator, day),
    getConsistencyForWindow(
      creator,
      fetchStart,
      window.end,
      day,
      goalsForContract(creator, active),
      {
        streakFrom: fetchStart,
        streakEpochStart: window.start,
        streakEpochEnd: window.end,
        windowStart: window.start,
      },
      scheduleFromContract(active),
    ),
  ])
  const last = lastCompletedStreak(summary.days, day, {
    streakFrom: fetchStart,
    resumeOn: restore.streakResumeOn,
    carry: restore.streakResumeOn ? restore.streakCarry : 0,
  })
  if (last <= 0) return { restored: 0, changed: false }
  if (displayed.currentStreak >= last) {
    return { restored: displayed.currentStreak, changed: false }
  }
  await sql`
    UPDATE creators
    SET streak_carry = ${last},
        streak_resume_on = ${day}::date
    WHERE id = ${creatorId}
  `
  return { restored: last, changed: true }
}

export async function restoreCreatorStreaks(
  creatorIds: number[],
  today?: string,
): Promise<{ restored: number; skipped: number }> {
  const ids = [...new Set(creatorIds.filter((id) => Number.isFinite(id) && id > 0))]
  const day = today ?? (await getServerToday())
  let restored = 0
  let skipped = 0
  for (const id of ids) {
    const result = await restoreCreatorStreak(id, day)
    if (result.changed) restored += 1
    else skipped += 1
  }
  return { restored, skipped }
}
