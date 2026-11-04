import 'server-only'
import { sql } from '@/lib/db'
import { lastCompletedOperationalDay } from '@/lib/operational-day'
import { isPostingDay, scheduleFromContract, type ScheduleColumns } from '@/lib/posting-schedule'
import { pausePerson } from '@/lib/pause-person'

/** Miss-day thresholds → verbal streak 1, 2, then kick. */
export const PROBATION_LEVEL_THRESHOLDS = { 1: 2, 2: 4, 3: 5 } as const
export type ProbationLevel = 1 | 2 | 3

export type ProbationNotice = {
  id: number
  creatorId: number
  name: string
  level: ProbationLevel
  unlockedOn: string
  missDates: string[]
  messagedAt: string | null
  missCount: number
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

export function buildProbationStreakMessage(notice: ProbationNotice): string {
  const days =
    notice.missDates.length > 0
      ? notice.missDates.map((d) => d.slice(5)).join(' و ')
      : notice.unlockedOn.slice(5)
  const left = Math.max(0, 3 - notice.level)

  if (notice.level === 1) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا إنذار شفهي رقم 1 من 3 (ستريك).`,
      `لم تنشر في الأيام: ${days}.`,
      `متبقي لديك ${left} إنذار${left === 1 ? '' : 'ات'}. بعد الإنذار الثالث سنتوقف عن العمل معك.`,
      `يرجى الالتزام بالنشر يومياً ورفع الروابط في نفس اليوم على الموقع.`,
    ].join('\n')
  }
  if (notice.level === 2) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا إنذار شفهي رقم 2 من 3 (ستريك).`,
      `الأيام بدون نشر: ${days}.`,
      `متبقي لديك إنذار واحد فقط. الإنذار الثالث = إيقاف التعاون.`,
      `انشر اليوم وارفع الرابط على الموقع فوراً.`,
    ].join('\n')
  }
  return [
    `مرحباً ${notice.name}،`,
    `هذا الإنذار الثالث والأخير.`,
    `بسبب تكرار عدم النشر في الموعد، سنتوقف عن العمل معك اعتباراً من اليوم.`,
    days ? `آخر أيام بدون نشر: ${days}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
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

/** Pending queue for Telegram: one button per unmessaged notice. */
export function probationStreakButtons(notices: ProbationNotice[]) {
  const rows = notices.slice(0, 40).map((n) => [
    {
      text: `${n.level === 3 ? '🚪' : '⚠️'} ${n.name} · streak ${n.level}`,
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
      `They only appear after 2 / 4 / 5 missed posting days on probation.`
    )
  }
  const lines = [
    `⚠️ CREATOR STREAKS · ${today}`,
    `Tap a name to get the Arabic message, then send it. They leave this list until their next streak.`,
    '',
  ]
  for (const n of notices) {
    const label =
      n.level === 1 ? '1st verbal' : n.level === 2 ? '2nd verbal' : '3rd = kick'
    lines.push(`• ${n.name} — ${label} (${n.missCount} miss days)`)
  }
  return lines.join('\n')
}
