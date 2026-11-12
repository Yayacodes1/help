import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { lastCompletedOperationalDay } from '@/lib/operational-day'
import { isPostingDay, scheduleFromContract, type ScheduleColumns } from '@/lib/posting-schedule'
import { pausePerson } from '@/lib/pause-person'
import {
  PROBATION_LEVEL_THRESHOLDS,
  STREAK_EPOCH_START,
  buildProbationStreakMessage,
  streakBucketFromMisses,
  type ProbationLevel,
  type ProbationNotice,
  type ProbationStreakBoard,
  type ProbationStreakPhase,
  type ProbationStreakRow,
} from '@/lib/probation-copy'

export {
  PROBATION_LEVEL_THRESHOLDS,
  STREAK_EPOCH_START,
  buildProbationStreakMessage,
  streakBucketFromMisses,
  type ProbationLevel,
  type ProbationNotice,
  type ProbationStreakBoard,
  type ProbationStreakPhase,
  type ProbationStreakRow,
}

function parseMissDates(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
}

function levelForMissCount(count: number): ProbationLevel | null {
  if (count >= PROBATION_LEVEL_THRESHOLDS[3]) return 3
  if (count >= PROBATION_LEVEL_THRESHOLDS[2]) return 2
  if (count >= PROBATION_LEVEL_THRESHOLDS[1]) return 1
  return null
}

function streakStartFor(personStartedOn: string | null): string {
  if (personStartedOn && personStartedOn > STREAK_EPOCH_START) return personStartedOn
  return STREAK_EPOCH_START
}

/** Walk backward from `end` counting consecutive posting-day misses. */
function consecutiveMisses(opts: {
  end: string
  start: string
  missSet: Set<string>
  schedule: ReturnType<typeof scheduleFromContract> | null
  contractStart: string | null
}): { count: number; dates: string[] } {
  const dates: string[] = []
  let cur = opts.end
  while (cur >= opts.start) {
    const posting =
      !opts.schedule || !opts.contractStart
        ? true
        : isPostingDay(opts.schedule, opts.contractStart, cur)
    if (!posting) {
      cur = addDays(cur, -1)
      continue
    }
    if (!opts.missSet.has(cur)) break
    dates.push(cur)
    cur = addDays(cur, -1)
  }
  dates.reverse()
  return { count: dates.length, dates }
}

/**
 * Sync miss strikes + streak notices for all active creators from Nov 7 (or their
 * probation start if later). Levels unlock on consecutive miss days: 1 / 2 / 3.
 */
export async function syncProbationMisses(opts: {
  today: string
  creatorId?: number
}): Promise<{ strikesAdded: number; noticesUnlocked: number }> {
  const today = opts.today
  const lastCompleted = lastCompletedOperationalDay(today)
  if (lastCompleted < STREAK_EPOCH_START) {
    return { strikesAdded: 0, noticesUnlocked: 0 }
  }
  const creatorId = opts.creatorId ?? null

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.probation_started_on::text AS probation_started_on
    FROM creators c
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND (${creatorId}::int IS NULL OR c.id = ${creatorId})
  `) as Array<{ id: number; name: string; probation_started_on: string | null }>

  let strikesAdded = 0
  let noticesUnlocked = 0

  for (const person of people) {
    const start = streakStartFor(person.probation_started_on)
    if (start > lastCompleted) continue

    const contractRows = (await sql`
      SELECT id, start_date::text AS start_date,
             COALESCE(schedule_type, 'daily') AS schedule_type,
             GREATEST(COALESCE(schedule_every_days, 2), 1) AS schedule_every_days,
             COALESCE(schedule_weekdays, '') AS schedule_weekdays,
             COALESCE(schedule_per_week, 0) AS schedule_per_week
      FROM contracts
      WHERE creator_id = ${person.id}
        AND start_date <= ${lastCompleted}::date
        AND (end_date IS NULL OR end_date >= ${start}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as Array<{ id: number; start_date: string } & ScheduleColumns>

    const contract = contractRows[0]
    if (!contract) continue
    const schedule = scheduleFromContract(contract)

    const inserted = (await sql`
      INSERT INTO creator_strikes (creator_id, contract_id, strike_date, source, status, reason)
      SELECT
        ${person.id},
        ${contract.id},
        days.d,
        'auto',
        'active',
        'Streak: did not post'
      FROM generate_series(${start}::date, ${lastCompleted}::date, interval '1 day') AS days(d)
      WHERE days.d < COALESCE(
          (SELECT paused_at FROM creators WHERE id = ${person.id}),
          '9999-12-31'::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM schedule_breaks b
          WHERE b.creator_id = ${person.id}
            AND b.start_date <= days.d
            AND b.end_date >= days.d
        )
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.creator_id = ${person.id} AND s.video_date = days.d
        )
        AND NOT EXISTS (
          SELECT 1 FROM creator_strikes x
          WHERE x.creator_id = ${person.id} AND x.strike_date = days.d
        )
      ON CONFLICT (creator_id, strike_date) DO NOTHING
      RETURNING id, strike_date::text AS strike_date
    `) as Array<{ id: number; strike_date: string }>

    for (const row of inserted) {
      if (!isPostingDay(schedule, contract.start_date, row.strike_date)) {
        await sql`DELETE FROM creator_strikes WHERE id = ${row.id}`
        continue
      }
      strikesAdded += 1
    }

    const missRows = (await sql`
      SELECT strike_date::text AS strike_date
      FROM creator_strikes
      WHERE creator_id = ${person.id}
        AND status = 'active'
        AND strike_date >= ${start}::date
        AND strike_date <= ${lastCompleted}::date
      ORDER BY strike_date ASC
    `) as Array<{ strike_date: string }>

    const missSet = new Set(
      missRows
        .map((r) => r.strike_date)
        .filter((d) => isPostingDay(schedule, contract.start_date, d)),
    )
    const { count: consecutive, dates: consecDates } = consecutiveMisses({
      end: lastCompleted,
      start,
      missSet,
      schedule,
      contractStart: contract.start_date,
    })

    // Streak broken → clear notices so they can climb 1→2→3 again.
    if (consecutive <= 0) {
      await sql`DELETE FROM probation_streak_notices WHERE creator_id = ${person.id}`
      continue
    }
    await sql`
      DELETE FROM probation_streak_notices
      WHERE creator_id = ${person.id}
        AND level > ${consecutive}
    `

    const maxLevel = levelForMissCount(consecutive)
    if (!maxLevel) continue

    for (const level of [1, 2, 3] as ProbationLevel[]) {
      if (consecutive < PROBATION_LEVEL_THRESHOLDS[level]) continue
      const unlockedOn =
        consecDates[PROBATION_LEVEL_THRESHOLDS[level] - 1] ?? lastCompleted
      const lastTwo = consecDates.slice(-Math.min(3, consecDates.length))
      const existing = (await sql`
        SELECT id, messaged_at FROM probation_streak_notices
        WHERE creator_id = ${person.id} AND level = ${level}
        LIMIT 1
      `) as { id: number; messaged_at: string | null }[]
      if (existing[0]) {
        if (existing[0].messaged_at == null) {
          await sql`
            UPDATE probation_streak_notices
            SET miss_dates = ${lastTwo.join(',')},
                miss_count = ${consecutive},
                unlocked_on = ${unlockedOn}::date
            WHERE id = ${existing[0].id}
          `
        }
        continue
      }
      await sql`
        INSERT INTO probation_streak_notices (
          creator_id, level, unlocked_on, miss_dates, miss_count
        )
        VALUES (
          ${person.id}, ${level}, ${unlockedOn}::date,
          ${lastTwo.join(',')}, ${consecutive}
        )
        ON CONFLICT (creator_id, level) DO NOTHING
      `
      noticesUnlocked += 1
    }
  }

  return { strikesAdded, noticesUnlocked }
}

/**
 * Wipe streak progress for one creator (strikes + notices since the epoch).
 * Pass `forgiveDay` (the board’s selected day) so they leave Didn’t post for that day
 * instead of sync putting the miss straight back.
 */
export async function resetCreatorStreak(
  creatorId: number,
  opts?: { forgiveDay?: string | null },
): Promise<{ ok: boolean }> {
  const id = Math.floor(Number(creatorId))
  if (!(id > 0)) return { ok: false }
  await sql`
    DELETE FROM creator_strikes
    WHERE creator_id = ${id}
      AND strike_date >= ${STREAK_EPOCH_START}::date
      AND source = 'auto'
  `
  await sql`DELETE FROM probation_streak_notices WHERE creator_id = ${id}`

  const forgiveDay = opts?.forgiveDay?.trim() ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(forgiveDay) && forgiveDay >= STREAK_EPOCH_START) {
    const contracts = (await sql`
      SELECT id
      FROM contracts
      WHERE creator_id = ${id}
        AND start_date <= ${forgiveDay}::date
        AND (end_date IS NULL OR end_date >= ${forgiveDay}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    const reason = `Forgiven by admin (${forgiveDay})`
    await sql`
      INSERT INTO creator_strikes (creator_id, contract_id, strike_date, source, status, reason)
      VALUES (${id}, ${contracts[0]?.id ?? null}, ${forgiveDay}::date, 'auto', 'waived', ${reason})
      ON CONFLICT (creator_id, strike_date) DO UPDATE
      SET status = 'waived',
          reason = EXCLUDED.reason
    `
  }

  const { getOperationalToday } = await import('@/lib/queries')
  await syncProbationMisses({ today: await getOperationalToday(), creatorId: id })
  return { ok: true }
}

/**
 * Take one miss day off a creator’s streak only.
 * Keeps a waived strike row so sync won’t put that day back as a miss.
 */
export async function forgiveCreatorStreakDay(
  creatorId: number,
  day: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = Math.floor(Number(creatorId))
  if (!(id > 0)) return { ok: false, error: 'Invalid creator' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < STREAK_EPOCH_START) {
    return { ok: false, error: 'Invalid day' }
  }

  const contracts = (await sql`
    SELECT id
    FROM contracts
    WHERE creator_id = ${id}
      AND start_date <= ${day}::date
      AND (end_date IS NULL OR end_date >= ${day}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { id: number }[]
  const contractId = contracts[0]?.id ?? null
  const reason = `Forgiven by admin (${day})`

  await sql`
    INSERT INTO creator_strikes (creator_id, contract_id, strike_date, source, status, reason)
    VALUES (${id}, ${contractId}, ${day}::date, 'auto', 'waived', ${reason})
    ON CONFLICT (creator_id, strike_date) DO UPDATE
    SET status = 'waived',
        reason = EXCLUDED.reason
  `

  const { getOperationalToday } = await import('@/lib/queries')
  await syncProbationMisses({ today: await getOperationalToday(), creatorId: id })
  return { ok: true }
}

/**
 * Take the selected day off everyone’s streak (optional project filter).
 * Only that day — other miss days stay.
 * Also covers “clean” leftovers who didn’t post that day but never got a strike row yet.
 */
export async function forgiveAllCreatorStreaksForDay(
  day: string,
  projectId?: number | null,
): Promise<{ cleared: number; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < STREAK_EPOCH_START) {
    return { cleared: 0, error: 'Invalid day' }
  }
  const pid = projectId != null && Number.isFinite(projectId) ? projectId : null
  const reason = `Forgiven by admin (${day})`

  // Everyone who would show as “didn’t post” that day — not only people with an active strike.
  const targets = (await sql`
    SELECT
      c.id AS creator_id,
      (
        SELECT ct.id
        FROM contracts ct
        WHERE ct.creator_id = c.id
          AND ct.start_date <= ${day}::date
          AND (ct.end_date IS NULL OR ct.end_date >= ${day}::date)
        ORDER BY ct.start_date DESC, ct.id DESC
        LIMIT 1
      ) AS contract_id
    FROM creators c
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND (${pid}::int IS NULL OR c.project_id = ${pid})
      AND NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.creator_id = c.id AND s.video_date = ${day}::date
      )
      AND NOT EXISTS (
        SELECT 1 FROM schedule_breaks b
        WHERE b.creator_id = c.id
          AND b.start_date <= ${day}::date
          AND b.end_date >= ${day}::date
      )
  `) as Array<{ creator_id: number; contract_id: number | null }>

  for (const row of targets) {
    await sql`
      INSERT INTO creator_strikes (creator_id, contract_id, strike_date, source, status, reason)
      VALUES (
        ${row.creator_id},
        ${row.contract_id},
        ${day}::date,
        'auto',
        'waived',
        ${reason}
      )
      ON CONFLICT (creator_id, strike_date) DO UPDATE
      SET status = 'waived',
          reason = EXCLUDED.reason
    `
  }

  const { getOperationalToday } = await import('@/lib/queries')
  await syncProbationMisses({ today: await getOperationalToday() })
  return { cleared: targets.length }
}

/** Reset streaks for every active creator (optional project filter). */
export async function resetAllCreatorStreaks(projectId?: number | null): Promise<{ cleared: number }> {
  const pid = projectId != null && Number.isFinite(projectId) ? projectId : null
  const ids = (await sql`
    SELECT id FROM creators
    WHERE role = 'creator'
      AND paused_at IS NULL
      AND (${pid}::int IS NULL OR project_id = ${pid})
  `) as { id: number }[]
  if (ids.length === 0) return { cleared: 0 }
  const creatorIds = ids.map((r) => r.id)
  await sql`
    DELETE FROM creator_strikes
    WHERE creator_id = ANY(${creatorIds}::int[])
      AND strike_date >= ${STREAK_EPOCH_START}::date
      AND source = 'auto'
  `
  await sql`
    DELETE FROM probation_streak_notices
    WHERE creator_id = ANY(${creatorIds}::int[])
  `
  return { cleared: creatorIds.length }
}

export async function listPendingProbationNotices(): Promise<ProbationNotice[]> {
  const rows = (await sql`
    SELECT
      n.id,
      n.creator_id,
      c.name,
      n.level,
      n.unlocked_on::text AS unlocked_on,
      n.miss_dates,
      n.messaged_at::text AS messaged_at,
      n.miss_count
    FROM probation_streak_notices n
    JOIN creators c ON c.id = n.creator_id
    WHERE n.messaged_at IS NULL
      AND c.paused_at IS NULL
      AND c.role = 'creator'
    ORDER BY n.level ASC, c.name ASC
  `) as Array<{
    id: number
    creator_id: number
    name: string
    level: number
    unlocked_on: string
    miss_dates: string
    messaged_at: string | null
    miss_count: number
  }>

  return rows.map((r) => ({
    id: r.id,
    creatorId: r.creator_id,
    name: r.name,
    level: (r.level === 2 || r.level === 3 ? r.level : 1) as ProbationLevel,
    unlockedOn: r.unlocked_on,
    missDates: parseMissDates(r.miss_dates),
    messagedAt: r.messaged_at,
    missCount: r.miss_count,
  }))
}

export async function markProbationNoticeMessaged(
  noticeId: number,
  today: string,
): Promise<{ ok: boolean; level?: ProbationLevel; creatorId?: number; error?: string }> {
  const rows = (await sql`
    SELECT id, creator_id, level, messaged_at
    FROM probation_streak_notices
    WHERE id = ${noticeId}
    LIMIT 1
  `) as Array<{ id: number; creator_id: number; level: number; messaged_at: string | null }>
  const row = rows[0]
  if (!row) return { ok: false, error: 'Notice not found' }
  if (row.messaged_at) return { ok: true, level: row.level as ProbationLevel, creatorId: row.creator_id }

  await sql`
    UPDATE probation_streak_notices
    SET messaged_at = NOW()
    WHERE id = ${noticeId}
  `

  const level = (row.level === 2 || row.level === 3 ? row.level : 1) as ProbationLevel
  if (level === 3) {
    await pausePerson(row.creator_id, today)
    await sql`
      UPDATE creators
      SET fitness_tier = NULL,
          probation_started_on = NULL
      WHERE id = ${row.creator_id}
    `
  }
  return { ok: true, level, creatorId: row.creator_id }
}

export async function getProbationNoticeById(noticeId: number): Promise<ProbationNotice | null> {
  const rows = (await sql`
    SELECT
      n.id, n.creator_id, c.name, n.level,
      n.unlocked_on::text AS unlocked_on,
      n.miss_dates, n.messaged_at::text AS messaged_at, n.miss_count
    FROM probation_streak_notices n
    JOIN creators c ON c.id = n.creator_id
    WHERE n.id = ${noticeId}
    LIMIT 1
  `) as Array<{
    id: number
    creator_id: number
    name: string
    level: number
    unlocked_on: string
    miss_dates: string
    messaged_at: string | null
    miss_count: number
  }>
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    creatorId: r.creator_id,
    name: r.name,
    level: (r.level === 2 || r.level === 3 ? r.level : 1) as ProbationLevel,
    unlockedOn: r.unlocked_on,
    missDates: parseMissDates(r.miss_dates),
    messagedAt: r.messaged_at,
    missCount: r.miss_count,
  }
}

function phaseFor(opts: {
  missCount: number
  pendingLevel: ProbationLevel | null
  paused: boolean
}): ProbationStreakPhase {
  if (opts.paused) return 'paused'
  if (opts.pendingLevel === 3) return 'due_kick'
  if (opts.pendingLevel === 2) return 'due_verbal2'
  if (opts.pendingLevel === 1) return 'due_verbal1'
  const c = opts.missCount
  if (c >= PROBATION_LEVEL_THRESHOLDS[3]) return 'due_kick'
  if (c >= PROBATION_LEVEL_THRESHOLDS[2]) return 'due_verbal2'
  if (c >= PROBATION_LEVEL_THRESHOLDS[1]) return 'due_verbal1'
  return 'clean'
}

function eachDayInclusive(from: string, to: string): string[] {
  if (from > to) return []
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Admin board: pick a day from Nov 7 → today; see posted / missed + streak ladder. */
export async function getProbationStreakBoard(opts: {
  today: string
  projectId?: number | null
  /** Focus day (defaults to today, clipped to epoch…today). */
  day?: string | null
}): Promise<ProbationStreakBoard> {
  const today = opts.today
  const projectId = opts.projectId ?? null
  const lastCompleted = lastCompletedOperationalDay(today)
  const dayOptions = eachDayInclusive(
    STREAK_EPOCH_START,
    today < STREAK_EPOCH_START ? STREAK_EPOCH_START : today,
  )
  const dayRaw =
    opts.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day) ? opts.day : today
  const selectedDay =
    dayRaw < STREAK_EPOCH_START
      ? STREAK_EPOCH_START
      : dayRaw > today
        ? today
        : dayRaw

  await syncProbationMisses({ today })

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.whatsapp_phone,
      c.project_id,
      p.name AS project_name,
      c.probation_started_on::text AS probation_started_on,
      c.paused_at::text AS paused_at
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND (${projectId}::int IS NULL OR c.project_id = ${projectId})
    ORDER BY c.name ASC
  `) as Array<{
    id: number
    name: string
    whatsapp_phone: string | null
    project_id: number | null
    project_name: string | null
    probation_started_on: string | null
    paused_at: string | null
  }>

  const notices = (await sql`
    SELECT
      n.id,
      n.creator_id,
      n.level,
      n.messaged_at::text AS messaged_at,
      n.miss_count
    FROM probation_streak_notices n
    JOIN creators c ON c.id = n.creator_id
    WHERE c.paused_at IS NULL
      AND c.role = 'creator'
      AND (${projectId}::int IS NULL OR c.project_id = ${projectId})
  `) as Array<{
    id: number
    creator_id: number
    level: number
    messaged_at: string | null
    miss_count: number
  }>

  const byCreator = new Map<number, typeof notices>()
  for (const n of notices) {
    const list = byCreator.get(n.creator_id) ?? []
    list.push(n)
    byCreator.set(n.creator_id, list)
  }

  const postedOnDayRows = (await sql`
    SELECT DISTINCT creator_id
    FROM submissions
    WHERE video_date = ${selectedDay}::date
  `) as { creator_id: number }[]
  const postedOnDay = new Set(postedOnDayRows.map((r) => Number(r.creator_id)))

  // Days forgiven via “clear this day” — keep them off the didn’t-post list for that day.
  const waivedOnDayRows = (await sql`
    SELECT DISTINCT creator_id
    FROM creator_strikes
    WHERE strike_date = ${selectedDay}::date
      AND status = 'waived'
      AND source = 'auto'
  `) as { creator_id: number }[]
  const waivedOnDay = new Set(waivedOnDayRows.map((r) => Number(r.creator_id)))

  const onBreakDay = (await sql`
    SELECT DISTINCT creator_id
    FROM schedule_breaks
    WHERE start_date <= ${selectedDay}::date
      AND end_date >= ${selectedDay}::date
  `) as { creator_id: number }[]
  const breakOnDay = new Set(onBreakDay.map((r) => Number(r.creator_id)))

  const rows: ProbationStreakRow[] = []
  const missedToday: ProbationStreakBoard['missedToday'] = []

  for (const person of people) {
    const start = streakStartFor(person.probation_started_on)
    const contractRows = (await sql`
      SELECT id, start_date::text AS start_date,
             COALESCE(schedule_type, 'daily') AS schedule_type,
             GREATEST(COALESCE(schedule_every_days, 2), 1) AS schedule_every_days,
             COALESCE(schedule_weekdays, '') AS schedule_weekdays,
             COALESCE(schedule_per_week, 0) AS schedule_per_week
      FROM contracts
      WHERE creator_id = ${person.id}
        AND start_date <= ${today}::date
        AND (end_date IS NULL OR end_date >= ${start}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as Array<{ id: number; start_date: string } & ScheduleColumns>

    const contract = contractRows[0]
    const schedule = contract ? scheduleFromContract(contract) : null

    const missRows = (await sql`
      SELECT strike_date::text AS strike_date
      FROM creator_strikes
      WHERE creator_id = ${person.id}
        AND status = 'active'
        AND strike_date >= ${start}::date
        AND strike_date <= ${lastCompleted}::date
      ORDER BY strike_date ASC
    `) as Array<{ strike_date: string }>

    const allMissDates =
      schedule && contract
        ? missRows
            .map((r) => r.strike_date)
            .filter((d) => isPostingDay(schedule, contract.start_date, d))
        : missRows.map((r) => r.strike_date)
    const missSet = new Set(allMissDates)
    const { count: missCount, dates: missDates } =
      lastCompleted >= start
        ? consecutiveMisses({
            end: lastCompleted,
            start,
            missSet,
            schedule,
            contractStart: contract?.start_date ?? null,
          })
        : { count: 0, dates: [] as string[] }

    const onBreak = breakOnDay.has(person.id)
    const shouldPost =
      selectedDay >= STREAK_EPOCH_START &&
      (!schedule || !contract || isPostingDay(schedule, contract.start_date, selectedDay))
    const posted = postedOnDay.has(person.id)
    const forgivenForSelectedDay = waivedOnDay.has(person.id)
    // Cleared this day’s miss → leave Didn’t post for this day (other days / All still count).
    if (shouldPost && !posted && forgivenForSelectedDay && !onBreak) continue

    const dayStatus: ProbationStreakRow['dayStatus'] = onBreak
      ? 'break'
      : !shouldPost
        ? 'off'
        : posted
          ? 'posted'
          : 'missed'
    const missedTodayFlag = dayStatus === 'missed' && selectedDay === today
    if (dayStatus === 'missed') {
      missedToday.push({
        creatorId: person.id,
        name: person.name,
        projectName: person.project_name,
      })
    }

    const personNotices = byCreator.get(person.id) ?? []
    const pending = personNotices
      .filter((n) => n.messaged_at == null)
      .sort((a, b) => a.level - b.level)[0]
    const lastMessaged = personNotices
      .filter((n) => n.messaged_at != null)
      .sort((a, b) => b.level - a.level)[0]

    const pendingLevel = pending
      ? ((pending.level === 2 || pending.level === 3 ? pending.level : 1) as ProbationLevel)
      : null
    const lastMessagedLevel = lastMessaged
      ? ((lastMessaged.level === 2 || lastMessaged.level === 3
          ? lastMessaged.level
          : 1) as ProbationLevel)
      : null

    const paused = person.paused_at != null
    const phase = phaseFor({ missCount, pendingLevel, paused })
    const streakLevel = streakBucketFromMisses(missCount)

    const nextThreshold =
      missCount < PROBATION_LEVEL_THRESHOLDS[1]
        ? PROBATION_LEVEL_THRESHOLDS[1]
        : missCount < PROBATION_LEVEL_THRESHOLDS[2]
          ? PROBATION_LEVEL_THRESHOLDS[2]
          : missCount < PROBATION_LEVEL_THRESHOLDS[3]
            ? PROBATION_LEVEL_THRESHOLDS[3]
            : null

    rows.push({
      creatorId: person.id,
      name: person.name,
      whatsappPhone: person.whatsapp_phone?.trim() || null,
      projectId: person.project_id,
      projectName: person.project_name,
      probationStartedOn: start,
      missCount,
      missDates,
      allMissDates,
      streakLevel,
      nextThreshold,
      missesToNext: nextThreshold != null ? nextThreshold - missCount : null,
      phase,
      pendingNoticeId: pending?.id ?? null,
      pendingLevel,
      lastMessagedLevel,
      paused,
      dayStatus,
      missedToday: missedTodayFlag,
    })
  }

  missedToday.sort((a, b) => a.name.localeCompare(b.name))

  const statusRank: Record<ProbationStreakRow['dayStatus'], number> = {
    missed: 0,
    posted: 1,
    break: 2,
    off: 3,
  }
  rows.sort(
    (a, b) =>
      statusRank[a.dayStatus] - statusRank[b.dayStatus] ||
      b.missCount - a.missCount ||
      a.name.localeCompare(b.name),
  )

  return {
    today,
    selectedDay,
    epochStart: STREAK_EPOCH_START,
    dayOptions,
    projectId,
    rows,
    missedToday,
    counts: {
      first: rows.filter((r) => !r.paused && streakBucketFromMisses(r.missCount) === 1).length,
      second: rows.filter((r) => !r.paused && streakBucketFromMisses(r.missCount) === 2).length,
      final: rows.filter((r) => !r.paused && streakBucketFromMisses(r.missCount) === 3).length,
      total: rows.filter((r) => !r.paused && r.missCount > 0).length,
      allCreators: rows.length,
      missedToday: rows.filter((r) => r.dayStatus === 'missed' && selectedDay === today).length,
      postedOnDay: rows.filter((r) => r.dayStatus === 'posted').length,
      missedOnDay: rows.filter((r) => r.dayStatus === 'missed').length,
      breakOnDay: rows.filter((r) => r.dayStatus === 'break').length,
    },
  }
}

/** Pending queue for Telegram: one button per unmessaged notice. */
export function probationStreakButtons(notices: ProbationNotice[]) {
  const rows = notices.slice(0, 40).map((n) => [
    {
      text: `${n.level === 3 ? '🚪' : '⚠️'} ${n.name} · ${
        n.level === 1 ? '1st verbal' : n.level === 2 ? '2nd verbal' : 'final'
      }`,
      callback_data: `pstreak:${n.id}`,
    },
  ])
  rows.push([{ text: '🔄 Refresh list', callback_data: 'pstreaks' }])
  return { inline_keyboard: rows }
}

export function probationStreakListText(notices: ProbationNotice[], today: string): string {
  if (notices.length === 0) {
    return (
      `⚠️ CREATOR STREAKS · ${today}\n` +
      `No creators waiting for a streak message.\n` +
      `From ${STREAK_EPOCH_START}: 1 miss day → first verbal · 2 → second verbal · 3 → final.\n` +
      `Arabic copy is warm: post on scheduled days, required count, upload same day, ask us for help.\n` +
      `Tap /streaks after people miss. Tap a name → copy Arabic → marks sent.`
    )
  }
  const lines = [
    `⚠️ CREATOR STREAKS · ${today}`,
    `From ${STREAK_EPOCH_START}: day 1 = first verbal · day 2 = second verbal · day 3 = final (fire).`,
    `Arabic copy: be kind, remind them to post on schedule + upload same day, and offer help.`,
    `Tap a name → copy Arabic → marked sent.`,
    '',
  ]
  for (const n of notices) {
    const label =
      n.level === 1
        ? 'first verbal'
        : n.level === 2
          ? 'second verbal'
          : 'final'
    lines.push(`• ${n.name} — ${label} (${n.missCount} consecutive miss day${n.missCount === 1 ? '' : 's'})`)
  }
  return lines.join('\n')
}

/** Snapshot for submit page / Telegram: consecutive miss days + streak level. */
export async function getCreatorProbationSnapshot(
  creatorId: number,
  today: string,
): Promise<{
  onProbation: boolean
  missCount: number
  missDates: string[]
  streakLevel: ProbationLevel | 0
  pendingLevel: ProbationLevel | null
  nextThreshold: number | null
  maxMisses: number
} | null> {
  await syncProbationMisses({ today, creatorId })

  const people = (await sql`
    SELECT
      c.id,
      c.probation_started_on::text AS probation_started_on,
      c.paused_at::text AS paused_at
    FROM creators c
    WHERE c.id = ${creatorId}
      AND c.role = 'creator'
    LIMIT 1
  `) as Array<{
    id: number
    probation_started_on: string | null
    paused_at: string | null
  }>
  const person = people[0]
  if (!person || person.paused_at) return null

  const lastCompleted = lastCompletedOperationalDay(today)
  const start = streakStartFor(person.probation_started_on)
  if (lastCompleted < start) {
    return {
      onProbation: true,
      missCount: 0,
      missDates: [],
      streakLevel: 0,
      pendingLevel: null,
      nextThreshold: PROBATION_LEVEL_THRESHOLDS[1],
      maxMisses: PROBATION_LEVEL_THRESHOLDS[3],
    }
  }

  const contractRows = (await sql`
    SELECT id, start_date::text AS start_date,
           COALESCE(schedule_type, 'daily') AS schedule_type,
           GREATEST(COALESCE(schedule_every_days, 2), 1) AS schedule_every_days,
           COALESCE(schedule_weekdays, '') AS schedule_weekdays,
           COALESCE(schedule_per_week, 0) AS schedule_per_week
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${lastCompleted}::date
      AND (end_date IS NULL OR end_date >= ${start}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as Array<{ id: number; start_date: string } & ScheduleColumns>
  const contract = contractRows[0]
  const schedule = contract ? scheduleFromContract(contract) : null

  const strikeRows = (await sql`
    SELECT strike_date::text AS d
    FROM creator_strikes
    WHERE creator_id = ${creatorId}
      AND strike_date >= ${start}::date
      AND strike_date <= ${lastCompleted}::date
      AND status = 'active'
    ORDER BY strike_date ASC
  `) as { d: string }[]
  const missSet = new Set(
    schedule && contract
      ? strikeRows.map((r) => r.d).filter((d) => isPostingDay(schedule, contract.start_date, d))
      : strikeRows.map((r) => r.d),
  )
  const { count: missCount, dates: missDates } = consecutiveMisses({
    end: lastCompleted,
    start,
    missSet,
    schedule,
    contractStart: contract?.start_date ?? null,
  })

  const notices = (await sql`
    SELECT level, messaged_at::text AS messaged_at
    FROM probation_streak_notices
    WHERE creator_id = ${creatorId}
    ORDER BY level ASC
  `) as Array<{ level: number; messaged_at: string | null }>

  let pendingLevel: ProbationLevel | null = null
  let lastMessagedLevel: ProbationLevel | 0 = 0
  for (const n of notices) {
    const level = (n.level === 2 || n.level === 3 ? n.level : 1) as ProbationLevel
    if (n.messaged_at) lastMessagedLevel = Math.max(lastMessagedLevel, level) as ProbationLevel
    else if (pendingLevel == null) pendingLevel = level
  }

  const unlocked = levelForMissCount(missCount)
  const streakLevel = (Math.max(lastMessagedLevel, unlocked ?? 0) || 0) as ProbationLevel | 0

  const nextThreshold =
    missCount < PROBATION_LEVEL_THRESHOLDS[1]
      ? PROBATION_LEVEL_THRESHOLDS[1]
      : missCount < PROBATION_LEVEL_THRESHOLDS[2]
        ? PROBATION_LEVEL_THRESHOLDS[2]
        : missCount < PROBATION_LEVEL_THRESHOLDS[3]
          ? PROBATION_LEVEL_THRESHOLDS[3]
          : null

  return {
    onProbation: true,
    missCount,
    missDates,
    streakLevel,
    pendingLevel,
    nextThreshold,
    maxMisses: PROBATION_LEVEL_THRESHOLDS[3],
  }
}
