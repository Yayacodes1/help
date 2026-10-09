import type { AttendanceStatus } from '@/lib/attendance-types'

export type PlanCounts = { posted: number; partial: number; missed: number; away: number }

export type LeaderRosterPerson = {
  id: number
  name: string
  status: AttendanceStatus
  yesterdayStatus: AttendanceStatus | null
  todayInstagram: number
  todayTiktok: number
  goalInstagram: number
  goalTiktok: number
  missStreak: number
  contractStrikes: number
  maxStrikes: number
  checked: boolean
  note: string | null
}

export type LeaderScore = {
  leaderId: number | null
  name: string
  todayPct: number | null
  yesterdayPct: number | null
  today: PlanCounts
  yesterday: PlanCounts
  checks: number
  roster: number
  atRisk: number
  reposterId: number | null
  reposterName: string | null
  reposterHandle: string | null
  reposterStatus: AttendanceStatus | null
  people: LeaderRosterPerson[]
}

export type LeaderBoard = {
  day: string
  prevDay: string
  all: { todayPct: number | null; yesterdayPct: number | null; today: PlanCounts; yesterday: PlanCounts }
  leaders: LeaderScore[]
  unassigned: LeaderScore | null
}

export type LeaderDirectory = {
  leaders: Array<{
    id: number
    name: string
    reposterId: number | null
    reposterName: string | null
    creatorIds: number[]
  }>
  creators: Array<{ id: number; name: string; leaderId: number | null }>
  reposters: Array<{ id: number; name: string }>
}

export const EMPTY_COUNTS: PlanCounts = { posted: 0, partial: 0, missed: 0, away: 0 }

export function onPlanPct(c: PlanCounts): number | null {
  const total = c.posted + c.partial + c.missed
  return total > 0 ? Math.round((c.posted / total) * 100) : null
}

/** `72% today · 64% yesterday ▲8` */
export function formatPlanCompare(
  todayPct: number | null,
  yesterdayPct: number | null,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  const diff = todayPct != null && yesterdayPct != null ? todayPct - yesterdayPct : null
  const trend = diff == null ? '' : diff > 0 ? ` ▲${diff}` : diff < 0 ? ` ▼${-diff}` : ' ='
  return `${todayPct ?? '–'}% ${todayLabel} · ${yesterdayPct ?? '–'}% ${yesterdayLabel}${trend}`
}

export function planDelta(todayPct: number | null, yesterdayPct: number | null): number | null {
  if (todayPct == null || yesterdayPct == null) return null
  return todayPct - yesterdayPct
}
