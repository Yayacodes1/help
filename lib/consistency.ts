import { addDays } from '@/lib/campaign'

export type DayStatus = 'hit' | 'partial' | 'miss' | 'none' | 'future'

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
}

function dayStatus(
  instagram: number,
  tiktok: number,
  goalInstagram: number,
  goalTiktok: number,
): Exclude<DayStatus, 'future'> {
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
}): ConsistencySummary {
  const { start, end, today, goalInstagram, goalTiktok, countsByDate } = options
  const cappedEnd = end < today ? end : today
  const dates = eachDate(start, end)

  const days: DayProgress[] = dates.map((date) => {
    const counts = countsByDate[date] ?? { instagram: 0, tiktok: 0 }
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
      status: dayStatus(counts.instagram, counts.tiktok, goalInstagram, goalTiktok),
    }
  })

  const pastRequired = days.filter(
    (d) => d.date <= cappedEnd && (d.status === 'hit' || d.status === 'partial' || d.status === 'miss'),
  )
  const hitDays = pastRequired.filter((d) => d.status === 'hit').length
  const missDays = pastRequired.filter((d) => d.status === 'miss').length
  const partialDays = pastRequired.filter((d) => d.status === 'partial').length
  const requiredDays = pastRequired.length
  const hitRate = requiredDays > 0 ? hitDays / requiredDays : 0

  // Current streak: consecutive hits ending at today (or most recent past day).
  let currentStreak = 0
  const streakDays = days.filter((d) => d.date <= today && d.status !== 'none' && d.status !== 'future')
  for (let i = streakDays.length - 1; i >= 0; i--) {
    if (streakDays[i].status === 'hit') currentStreak++
    else break
  }

  let bestStreak = 0
  let run = 0
  for (const d of streakDays) {
    if (d.status === 'hit') {
      run++
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }

  return {
    days,
    requiredDays,
    hitDays,
    missDays,
    partialDays,
    hitRate,
    currentStreak,
    bestStreak,
  }
}
