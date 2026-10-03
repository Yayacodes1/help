import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { CORRECTIVE_STRIKE_COUNT, OPERATIONAL_TZ, strikeLimit } from '@/lib/operational-day'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'

export type { AttendancePerson, AttendanceReport, AttendanceStatus } from '@/lib/attendance-types'

function personStatus(opts: {
  onBreak: boolean
  goalIg: number
  goalTt: number
  ig: number
  tt: number
}): AttendanceStatus {
  if (opts.onBreak) return 'break'
  const hasGoal = opts.goalIg > 0 || opts.goalTt > 0
  if (!hasGoal) {
    const any = opts.ig > 0 || opts.tt > 0
    return any ? 'hit' : 'miss'
  }
  const igOk = opts.goalIg <= 0 || opts.ig >= opts.goalIg
  const ttOk = opts.goalTt <= 0 || opts.tt >= opts.goalTt
  if (igOk && ttOk) return 'hit'
  const any = opts.ig > 0 || opts.tt > 0
  return any ? 'partial' : 'miss'
}

/**
 * Roster for one calendar/operational day (creators + reposters).
 * With `projectId`, only posts for that project count.
 */
export async function getAttendanceForDay(
  day: string,
  projectId?: number | null,
): Promise<AttendancePerson[]> {
  const pid = projectId ?? null
  const [people, contracts, postRows, breakRows, strikeRows] = (await Promise.all([
    sql`
      SELECT id, name, role,
             goal_instagram, goal_tiktok
      FROM creators
      WHERE role IN ('creator', 'reposter')
        AND (paused_at IS NULL OR paused_at > ${day}::date)
        AND (created_at AT TIME ZONE ${OPERATIONAL_TZ})::date <= ${day}::date
      ORDER BY role ASC, name ASC
    `,
    sql`
      SELECT DISTINCT ON (creator_id)
        id, creator_id, name,
        goal_instagram, goal_tiktok,
        COALESCE(max_strikes, ${CORRECTIVE_STRIKE_COUNT})::int AS max_strikes
      FROM contracts
      WHERE start_date <= ${day}::date
        AND (end_date IS NULL OR end_date >= ${day}::date)
      ORDER BY creator_id, start_date DESC, id DESC
    `,
    sql`
      SELECT creator_id,
             COALESCE(SUM(CASE WHEN platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS ig,
             COALESCE(SUM(CASE WHEN platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS tt
      FROM submissions
      WHERE video_date = ${day}::date
        AND (${pid}::int IS NULL OR project_id = ${pid})
      GROUP BY creator_id
    `,
    sql`
      SELECT creator_id
      FROM schedule_breaks
      WHERE start_date <= ${day}::date AND end_date >= ${day}::date
    `,
    sql`
      SELECT creator_id, contract_id, strike_date::text AS strike_date
      FROM creator_strikes
      WHERE status = 'active'
    `,
  ])) as [
    Array<{
      id: number
      name: string
      role: string
      goal_instagram: number
      goal_tiktok: number
    }>,
    Array<{
      id: number
      creator_id: number
      name: string
      goal_instagram: number
      goal_tiktok: number
      max_strikes: number
    }>,
    Array<{ creator_id: number; ig: number; tt: number }>,
    Array<{ creator_id: number }>,
    Array<{ creator_id: number; contract_id: number | null; strike_date: string }>,
  ]

  const contractByCreator = new Map(contracts.map((c) => [c.creator_id, c]))
  const postsByCreator = new Map(postRows.map((p) => [p.creator_id, p]))
  const onBreak = new Set(breakRows.map((b) => b.creator_id))

  const strikesByCreator = new Map<number, { count: number; dates: Set<string> }>()
  for (const row of strikeRows) {
    const contract = contractByCreator.get(row.creator_id)
    if (contract) {
      if (row.contract_id != null && row.contract_id !== contract.id) continue
    }
    const prev = strikesByCreator.get(row.creator_id) ?? {
      count: 0,
      dates: new Set<string>(),
    }
    prev.count += 1
    prev.dates.add(row.strike_date)
    strikesByCreator.set(row.creator_id, prev)
  }

  function missStreakFor(creatorId: number, status: AttendanceStatus): number {
    if (status !== 'miss') return 0
    const dates = strikesByCreator.get(creatorId)?.dates ?? new Set<string>()
    let streak = 0
    let cursor = day
    for (let i = 0; i < 30; i++) {
      const isMissDay = cursor === day || dates.has(cursor)
      if (!isMissDay) break
      streak += 1
      cursor = addDays(cursor, -1)
    }
    return Math.max(1, streak)
  }

  return people.map((p) => {
    const contract = contractByCreator.get(p.id) ?? null
    const posts = postsByCreator.get(p.id)
    const ig = posts?.ig ?? 0
    const tt = posts?.tt ?? 0
    const goalIg =
      contract && (contract.goal_instagram > 0 || contract.goal_tiktok > 0)
        ? contract.goal_instagram
        : p.goal_instagram
    const goalTt =
      contract && (contract.goal_instagram > 0 || contract.goal_tiktok > 0)
        ? contract.goal_tiktok
        : p.goal_tiktok
    const status = personStatus({
      onBreak: onBreak.has(p.id),
      goalIg,
      goalTt,
      ig,
      tt,
    })
    const strikeInfo = strikesByCreator.get(p.id)
    const maxStrikes = strikeLimit(contract?.max_strikes)
    const role = p.role === 'reposter' ? 'reposter' : 'creator'
    return {
      id: p.id,
      name: p.name,
      role,
      status,
      todayInstagram: ig,
      todayTiktok: tt,
      goalInstagram: goalIg,
      goalTiktok: goalTt,
      missStreak: role === 'reposter' ? missStreakFor(p.id, status) : 0,
      contractStrikes: strikeInfo?.count ?? 0,
      maxStrikes,
      contractId: contract?.id ?? null,
      contractName: contract?.name ?? null,
    }
  })
}
