import { addDays } from '@/lib/campaign'
import { DAILY_SCHEDULE, isPostingDay, weekBlock, type PostingSchedule } from '@/lib/posting-schedule'

export type DayStatus = 'hit' | 'partial' | 'miss' | 'none' | 'future' | 'break'

export type DayProgress = {
  date: string
  instagram: number
  tiktok: number
  goalInstagram: number
  goalTiktok: number
  status: DayStatus
}

export type ConsistencySummary = {
  days: DayProgress[]
  requiredDays: number
  hitDays: number
  missDays: number
  partialDays: number
  hitRate: number
  currentStreak: number
  bestStreak: number
  /** Active streak period start (inclusive). */
  streakEpochStart?: string
  /** Active streak period end (inclusive). */
  streakEpochEnd?: string
  /** First day that counts toward streak (epoch start left out). */
  streakFrom?: string
}

function dayStatus(
  instagram: number,
  tiktok: number,
  goalInstagram: number,
  goalTiktok: number,
): Exclude<DayStatus, 'future' | 'break'> {
  const hasGoal = goalInstagram > 0 || goalTiktok > 0
  if (!hasGoal) return 'none'

  const igOk = goalInstagram <= 0 || instagram >= goalInstagram
  const ttOk = goalTiktok <= 0 || tiktok >= goalTiktok
  if (igOk && ttOk) return 'hit'

  const anyPost = instagram > 0 || tiktok > 0
  return anyPost ? 'partial' : 'miss'
}

/** Inclusive list of YYYY-MM-DD from start to end (UTC). */
export function eachDate(start: string, end: string): string[] {
  if (start > end) return []
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export function nextPayDate(
  lastPaidAt: string | null,
  payEveryDays: number,
  today: string,
  contractStart: string | null,
): string | null {
  const every = payEveryDays > 0 ? payEveryDays : 14
  if (lastPaidAt) return addDays(lastPaidAt, every)
  if (contractStart) {
    let next = contractStart
    while (next < today) next = addDays(next, every)
    return next
  }
  return addDays(today, every)
}

export function buildConsistency(options: {
  start: string
  end: string
  today: string
  goalInstagram: number
  goalTiktok: number
  countsByDate: Record<string, { instagram: number; tiktok: number }>
  breakDates?: Set<string> | string[]
  /** Only dates >= this count toward current/best streak (leave epoch day 1 out). */
  streakFrom?: string | null
  streakEpochStart?: string | null
  streakEpochEnd?: string | null
  /** Extra consecutive hits before the scored window. Applied only if the current run is unbroken. */
  streakCarry?: number | null
  /** Hit rate / miss counts start here; earlier days are lookback for streaks only. */
  windowStart?: string | null
  /** Which days need posts; omitted = every day. Weekly plans are scored once per 7-day block. */
  schedule?: PostingSchedule | null
}): ConsistencySummary {
  const { start, end, today, goalInstagram, goalTiktok, countsByDate } = options
  const schedule = options.schedule ?? DAILY_SCHEDULE
  const videosOn = (date: string) => {
    const c = countsByDate[date]
    return c ? c.instagram + c.tiktok : 0
  }
  const scheduledStatus = (date: string, instagram: number, tiktok: number): DayStatus => {
    if (schedule.type === 'per_week') {
      const block = weekBlock(start, date)
      if (date !== block.end) return 'none'
      const total = eachDate(block.start, block.end).reduce((sum, d) => sum + videosOn(d), 0)
      if (total >= schedule.perWeek) return 'hit'
      return total > 0 ? 'partial' : 'miss'
    }
    if (!isPostingDay(schedule, start, date)) return 'none'
    return dayStatus(instagram, tiktok, goalInstagram, goalTiktok)
  }
  const breaks = options.breakDates instanceof Set
    ? options.breakDates
    : new Set(options.breakDates ?? [])
  const cappedEnd = end < today ? end : today
  const dates = eachDate(start, end)
  const streakFrom = options.streakFrom ?? null

  const days: DayProgress[] = dates.map((date) => {
    const counts = countsByDate[date] ?? { instagram: 0, tiktok: 0 }
    if (breaks.has(date)) {
      return {
        date,
        instagram: counts.instagram,
        tiktok: counts.tiktok,
        goalInstagram,
        goalTiktok,
        status: 'break' as const,
      }
    }
    if (date > today) {
      return {
        date,
        instagram: 0,
        tiktok: 0,
        goalInstagram,
        goalTiktok,
        status: 'future' as const,
      }
    }
    return {
      date,
      instagram: counts.instagram,
      tiktok: counts.tiktok,
      goalInstagram,
      goalTiktok,
      status: scheduledStatus(date, counts.instagram, counts.tiktok),
    }
  })

  const windowStart = options.windowStart ?? null
  const rateDays = windowStart ? days.filter((d) => d.date >= windowStart) : days
  const pastRequired = rateDays.filter(
    (d) => d.date <= cappedEnd && (d.status === 'hit' || d.status === 'partial' || d.status === 'miss'),
  )
  const hitDays = pastRequired.filter((d) => d.status === 'hit').length
  const missDays = pastRequired.filter((d) => d.status === 'miss').length
  const partialDays = pastRequired.filter((d) => d.status === 'partial').length
  const requiredDays = pastRequired.length
  const hitRate = requiredDays > 0 ? hitDays / requiredDays : 0

  const streakDays = streakEligibleDays(days, today, streakFrom)
  const carry = Math.max(0, Math.floor(options.streakCarry ?? 0))
  const currentStreak = currentStreakFromDays(streakDays, today, carry)

  let bestStreak = 0
  let run = 0
  for (const d of streakDays) {
    if (d.status === 'break' || isPendingToday(d, today)) continue
    if (d.status === 'hit') {
      run++
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }
  if (currentStreak > bestStreak) bestStreak = currentStreak

  return {
    days,
    requiredDays,
    hitDays,
    missDays,
    partialDays,
    hitRate,
    currentStreak,
    bestStreak,
    streakEpochStart: options.streakEpochStart ?? undefined,
    streakEpochEnd: options.streakEpochEnd ?? undefined,
    streakFrom: streakFrom ?? undefined,
  }
}

function isPendingToday(day: DayProgress, today: string): boolean {
  return day.date === today && day.status !== 'hit' && day.status !== 'break'
}

export function streakEligibleDays(
  days: DayProgress[],
  today: string,
  streakFrom?: string | null,
): DayProgress[] {
  return days.filter(
    (d) =>
      d.date <= today &&
      d.status !== 'none' &&
      d.status !== 'future' &&
      (streakFrom == null || d.date >= streakFrom),
  )
}

/** Consecutive hits ending at today. Breaks and an unfinished today are skipped, not a reset. */
export function currentStreakFromDays(
  streakDays: DayProgress[],
  today: string,
  carry = 0,
): number {
  let currentStreak = 0
  let broken = false
  for (let i = streakDays.length - 1; i >= 0; i--) {
    const day = streakDays[i]
    if (day.status === 'break' || isPendingToday(day, today)) continue
    if (day.status === 'hit') currentStreak++
    else {
      broken = true
      break
    }
  }
  if (!broken) currentStreak += Math.max(0, Math.floor(carry))
  return currentStreak
}

/**
 * Number to put back on restore: the live streak if it never dropped, otherwise
 * the run before the latest miss plus later hits before today (the miss is forgiven).
 */
export function lastCompletedStreak(
  days: DayProgress[],
  today: string,
  opts?: { streakFrom?: string | null; resumeOn?: string | null; carry?: number | null },
): number {
  const resumeOn = opts?.resumeOn ?? null
  const carry = Math.max(0, Math.floor(opts?.carry ?? 0))
  const streakFrom = resumeOn ?? opts?.streakFrom ?? null
  const streakDays = streakEligibleDays(days, today, streakFrom)
  let run = resumeOn ? carry : 0
  let preMiss = 0
  let afterMissHitsBeforeToday = 0
  let afterMiss = false
  for (const d of streakDays) {
    if (d.status === 'break' || isPendingToday(d, today)) continue
    if (d.status === 'hit') {
      run++
      if (afterMiss && d.date < today) afterMissHitsBeforeToday++
    } else {
      preMiss = run
      run = 0
      afterMiss = true
      afterMissHitsBeforeToday = 0
    }
  }
  if (!afterMiss) return run
  return preMiss + afterMissHitsBeforeToday
}
