import 'server-only'
import { sql } from '@/lib/db'
import { lastCompletedOperationalDay } from '@/lib/operational-day'
import { isPostingDay, scheduleFromContract, type ScheduleColumns } from '@/lib/posting-schedule'
import { pausePerson } from '@/lib/pause-person'
import {
  PROBATION_LEVEL_THRESHOLDS,
  buildProbationStreakMessage,
  type ProbationLevel,
  type ProbationNotice,
  type ProbationStreakBoard,
  type ProbationStreakPhase,
  type ProbationStreakRow,
} from '@/lib/probation-copy'

export {
  PROBATION_LEVEL_THRESHOLDS,
  buildProbationStreakMessage,
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

/** Insert auto miss strikes for probation creators from probation_started_on → last completed day. */
export async function syncProbationMisses(opts: {
  today: string
  creatorId?: number
}): Promise<{ strikesAdded: number; noticesUnlocked: number }> {
  const today = opts.today
  const lastCompleted = lastCompletedOperationalDay(today)
  const creatorId = opts.creatorId ?? null

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.probation_started_on::text AS probation_started_on
    FROM creators c
    WHERE c.role = 'creator'
      AND c.fitness_tier = 'probation'
      AND c.probation_started_on IS NOT NULL
      AND c.paused_at IS NULL
      AND (${creatorId}::int IS NULL OR c.id = ${creatorId})
  `) as Array<{ id: number; name: string; probation_started_on: string }>

  let strikesAdded = 0
  let noticesUnlocked = 0

  for (const person of people) {
    const start =
      person.probation_started_on > lastCompleted
        ? null
        : person.probation_started_on <= lastCompleted
          ? person.probation_started_on
          : null
    if (!start || start > lastCompleted) continue

    const [contractRows] = (await Promise.all([
      sql`
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
      `,
    ])) as [Array<{ id: number; start_date: string } & ScheduleColumns>]

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
        'Probation: did not post'
      FROM generate_series(${start}::date, ${lastCompleted}::date, interval '1 day') AS days(d)
      WHERE days.d >= ${person.probation_started_on}::date
        AND days.d < COALESCE(
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

    // Filter inserted to posting days only (SQL above inserts all non-post days;
    // for daily schedules that's correct; for every_n / weekdays filter in JS).
    const keptDates: string[] = []
    for (const row of inserted) {
      if (!isPostingDay(schedule, contract.start_date, row.strike_date)) {
        await sql`DELETE FROM creator_strikes WHERE id = ${row.id}`
        continue
      }
      keptDates.push(row.strike_date)
    }
    strikesAdded += keptDates.length

    const missRows = (await sql`
      SELECT strike_date::text AS strike_date
      FROM creator_strikes
      WHERE creator_id = ${person.id}
        AND status = 'active'
        AND strike_date >= ${person.probation_started_on}::date
      ORDER BY strike_date ASC
    `) as Array<{ strike_date: string }>

    // Only count posting-day misses
    const missDates = missRows
      .map((r) => r.strike_date)
      .filter((d) => isPostingDay(schedule, contract.start_date, d))
    const missCount = missDates.length
    const maxLevel = levelForMissCount(missCount)
    if (!maxLevel) continue

    for (const level of [1, 2, 3] as ProbationLevel[]) {
      if (missCount < PROBATION_LEVEL_THRESHOLDS[level]) continue
      const lastTwo = missDates.slice(-2)
      const unlockedOn = missDates[PROBATION_LEVEL_THRESHOLDS[level] - 1] ?? lastCompleted
      const existing = (await sql`
        SELECT id FROM probation_streak_notices
        WHERE creator_id = ${person.id} AND level = ${level}
        LIMIT 1
      `) as { id: number }[]
      if (existing[0]) {
        await sql`
          UPDATE probation_streak_notices
          SET miss_dates = ${lastTwo.join(',')},
              miss_count = ${missCount}
          WHERE id = ${existing[0].id} AND messaged_at IS NULL
        `
        continue
      }
      await sql`
        INSERT INTO probation_streak_notices (
          creator_id, level, unlocked_on, miss_dates, miss_count
        )
        VALUES (
          ${person.id}, ${level}, ${unlockedOn}::date,
          ${lastTwo.join(',')}, ${missCount}
        )
        ON CONFLICT (creator_id, level) DO NOTHING
      `
      noticesUnlocked += 1
    }
  }

  return { strikesAdded, noticesUnlocked }
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
      AND c.fitness_tier = 'probation'
      AND c.paused_at IS NULL
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
      SET fitness_tier = NULL
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
  const t1 = PROBATION_LEVEL_THRESHOLDS[1]
  const t2 = PROBATION_LEVEL_THRESHOLDS[2]
  const t3 = PROBATION_LEVEL_THRESHOLDS[3]
  if (c >= t3) return 'due_kick'
  if (c > t2 && c < t3) return 'near_kick'
  if (c > t1 && c < t2) return 'near_verbal2'
  if (c >= 1 && c < t1) return 'near_verbal1'
  return 'clean'
}

/** Admin board: everyone on probation + miss progress toward first / second / final streak. */
export async function getProbationStreakBoard(opts: {
  today: string
  projectId?: number | null
}): Promise<ProbationStreakBoard> {
  const today = opts.today
  const projectId = opts.projectId ?? null

  await syncProbationMisses({ today })

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.project_id,
      p.name AS project_name,
      c.probation_started_on::text AS probation_started_on,
      c.paused_at::text AS paused_at
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.role = 'creator'
      AND c.fitness_tier = 'probation'
      AND c.probation_started_on IS NOT NULL
      AND (${projectId}::int IS NULL OR c.project_id = ${projectId})
    ORDER BY c.name ASC
  `) as Array<{
    id: number
    name: string
    project_id: number | null
    project_name: string | null
    probation_started_on: string
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
    WHERE c.fitness_tier = 'probation'
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

  const rows: ProbationStreakRow[] = []

  for (const person of people) {
    const contractRows = (await sql`
      SELECT id, start_date::text AS start_date,
             COALESCE(schedule_type, 'daily') AS schedule_type,
             GREATEST(COALESCE(schedule_every_days, 2), 1) AS schedule_every_days,
             COALESCE(schedule_weekdays, '') AS schedule_weekdays,
             COALESCE(schedule_per_week, 0) AS schedule_per_week
      FROM contracts
      WHERE creator_id = ${person.id}
        AND start_date <= ${today}::date
        AND (end_date IS NULL OR end_date >= ${person.probation_started_on}::date)
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
        AND strike_date >= ${person.probation_started_on}::date
      ORDER BY strike_date ASC
    `) as Array<{ strike_date: string }>

    const missDates =
      schedule && contract
        ? missRows
            .map((r) => r.strike_date)
            .filter((d) => isPostingDay(schedule, contract.start_date, d))
        : missRows.map((r) => r.strike_date)
    const missCount = missDates.length

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
      projectId: person.project_id,
      projectName: person.project_name,
      probationStartedOn: person.probation_started_on,
      missCount,
      missDates,
      nextThreshold,
      missesToNext: nextThreshold != null ? nextThreshold - missCount : null,
      phase,
      pendingNoticeId: pending?.id ?? null,
      pendingLevel,
      lastMessagedLevel,
      paused,
    })
  }

  const phaseRank: Record<ProbationStreakPhase, number> = {
    due_kick: 0,
    due_verbal2: 1,
    due_verbal1: 2,
    near_kick: 3,
    near_verbal2: 4,
    near_verbal1: 5,
    clean: 6,
    paused: 7,
  }
  rows.sort(
    (a, b) =>
      phaseRank[a.phase] - phaseRank[b.phase] ||
      b.missCount - a.missCount ||
      a.name.localeCompare(b.name),
  )

  return {
    today,
    projectId,
    rows,
    counts: {
      onProbation: rows.filter((r) => !r.paused).length,
      approaching: rows.filter((r) =>
        r.phase === 'near_verbal1' ||
        r.phase === 'near_verbal2' ||
        r.phase === 'near_kick',
      ).length,
      due: rows.filter((r) =>
        r.phase === 'due_verbal1' ||
        r.phase === 'due_verbal2' ||
        r.phase === 'due_kick',
      ).length,
      paused: rows.filter((r) => r.paused).length,
    },
  }
}

/** Pending queue for Telegram: one button per unmessaged notice. */
export function probationStreakButtons(notices: ProbationNotice[]) {
  const rows = notices.slice(0, 40).map((n) => [
    {
      text: `${n.level === 3 ? '🚪' : '⚠️'} ${n.name} · ${
        n.level === 1 ? 'first' : n.level === 2 ? 'second' : 'final'
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
      `They only appear after 3 / 6 / 10 missed posting days → first / second / final streak.`
    )
  }
  const lines = [
    `⚠️ CREATOR STREAKS · ${today}`,
    `Tap a name for first / second / final streak Arabic (3 → 6 → 10). They leave this list until the next streak.`,
    '',
  ]
  for (const n of notices) {
    const label =
      n.level === 1 ? 'first streak' : n.level === 2 ? 'second streak' : 'final streak'
    lines.push(`• ${n.name} — ${label} (${n.missCount} miss days)`)
  }
  return lines.join('\n')
}

/** Snapshot for submit page / Telegram: miss days + highest unlocked streak level. */
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
      c.fitness_tier,
      c.probation_started_on::text AS probation_started_on,
      c.paused_at::text AS paused_at
    FROM creators c
    WHERE c.id = ${creatorId}
      AND c.role = 'creator'
    LIMIT 1
  `) as Array<{
    id: number
    fitness_tier: string | null
    probation_started_on: string | null
    paused_at: string | null
  }>
  const person = people[0]
  if (!person) return null

  const onProbation =
    person.fitness_tier === 'probation' && person.probation_started_on != null
  if (!onProbation) {
    return {
      onProbation: false,
      missCount: 0,
      missDates: [],
      streakLevel: 0,
      pendingLevel: null,
      nextThreshold: PROBATION_LEVEL_THRESHOLDS[1],
      maxMisses: PROBATION_LEVEL_THRESHOLDS[3],
    }
  }

  const lastCompleted = lastCompletedOperationalDay(today)
  const start = person.probation_started_on!
  const strikeRows = (await sql`
    SELECT strike_date::text AS d
    FROM creator_strikes
    WHERE creator_id = ${creatorId}
      AND strike_date >= ${start}::date
      AND strike_date <= ${lastCompleted}::date
      AND status = 'active'
    ORDER BY strike_date ASC
  `) as { d: string }[]
  const missDates = strikeRows.map((r) => r.d)
  const missCount = missDates.length

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
