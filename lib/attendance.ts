import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import {
  CORRECTIVE_STRIKE_COUNT,
  OPERATIONAL_TZ,
  lastCompletedOperationalDay,
  strikeLimit,
} from '@/lib/operational-day'
import type {
  AttendancePerson,
  AttendanceReport,
  AttendanceStatus,
} from '@/lib/attendance-types'

export type { AttendancePerson, AttendanceReport, AttendanceStatus } from '@/lib/attendance-types'

function formatDayLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

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

/** Roster for one calendar/operational day (creators + reposters). */
export async function getAttendanceForDay(day: string): Promise<AttendancePerson[]> {
  const [people, contracts, postRows, breakRows, strikeRows] = (await Promise.all([
    sql`
      SELECT id, name, role,
             goal_instagram, goal_tiktok
      FROM creators
      WHERE role IN ('creator', 'reposter')
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

export async function buildAttendanceReport(opToday: string): Promise<AttendanceReport> {
  const day = lastCompletedOperationalDay(opToday)
  const people = await getAttendanceForDay(day)
  return {
    day,
    opToday,
    dayLabel: formatDayLabel(day),
    people,
  }
}

function missingParts(p: AttendancePerson): string {
  const parts: string[] = []
  if (p.goalInstagram > 0 && p.todayInstagram < p.goalInstagram) {
    parts.push(`IG ${p.goalInstagram - p.todayInstagram}`)
  }
  if (p.goalTiktok > 0 && p.todayTiktok < p.goalTiktok) {
    parts.push(`TT ${p.goalTiktok - p.todayTiktok}`)
  }
  return parts.join(' · ')
}

function countsLine(p: AttendancePerson): string {
  const bits: string[] = []
  if (p.goalInstagram > 0) bits.push(`IG ${p.todayInstagram}/${p.goalInstagram}`)
  if (p.goalTiktok > 0) bits.push(`TT ${p.todayTiktok}/${p.goalTiktok}`)
  if (bits.length === 0) {
    bits.push(`IG ${p.todayInstagram}`, `TT ${p.todayTiktok}`)
  }
  return bits.join(' · ')
}

function countStatuses(people: AttendancePerson[]) {
  let full = 0
  let partial = 0
  let miss = 0
  let onBreak = 0
  for (const p of people) {
    if (p.status === 'hit') full += 1
    else if (p.status === 'partial') partial += 1
    else if (p.status === 'miss') miss += 1
    else if (p.status === 'break') onBreak += 1
  }
  return { total: people.length, full, partial, miss, onBreak }
}

function formatTotalsBlock(
  label: string,
  stats: ReturnType<typeof countStatuses>,
): string {
  return (
    `${label}: ${stats.total} · full ${stats.full} · partial ${stats.partial}` +
    ` · miss ${stats.miss} · break ${stats.onBreak}`
  )
}

/** Arabic outreach templates (reposters). English lists stay in formatAttendanceTelegram. */
export function arabicStrikeTemplate(
  name: string,
  strikes: number,
  max: number,
  missedDayLabel: string,
): string {
  const left = Math.max(0, max - strikes)
  if (strikes <= 1) {
    return (
      `مرحباً ${name}، لاحظنا أنك لم تنشر يوم ${missedDayLabel}.\n` +
      `هذا الإنذار رقم 1 من ${max}. يرجى الانتباه — متبقي لديك ${left} إنذار.\n` +
      `إذا واجهت أي مشكلة، أخبرنا قبل أن تفوّت الموعد.`
    )
  }
  if (strikes === 2 || (strikes < max && strikes > 1)) {
    return (
      `مرحباً ${name}، هذا الإنذار رقم ${strikes} من ${max} (يوم ${missedDayLabel}).\n` +
      `سبق أن حصلت على إنذار. إذا لديك ظرف، تواصل معنا أولاً — متبقي ${left}.`
    )
  }
  return (
    `مرحباً ${name}، هذا الإنذار رقم ${strikes} من ${max} (يوم ${missedDayLabel}).\n` +
    `للأسف استُهلكت كل الإنذارات. إذا تكرر التأخير مرة أخرى قد نتوقف عن العمل معك.`
  )
}

export function arabicPartialTemplate(
  name: string,
  missing: string,
  dayLabel: string,
): string {
  return (
    `مرحباً ${name}، يرجى إكمال منشورات يوم ${dayLabel} قبل الساعة 12:00 منتصف الليل بتوقيت السعودية.\n` +
    `ما زال ينقصك: ${missing || 'إكمال الهدف'}.\n` +
    `وتأكد من النشر على جميع الحسابات المطلوبة.`
  )
}

export function formatAttendanceTelegram(report: AttendanceReport): string {
  const reposters = report.people.filter((p) => p.role === 'reposter')
  const creators = report.people.filter((p) => p.role === 'creator')
  const allStats = countStatuses(report.people)
  const reposterStats = countStatuses(reposters)
  const creatorStats = countStatuses(creators)

  const lines: string[] = [
    `📋 Last 24h · ${report.dayLabel}`,
    `Cutoff: 12:00 AM ${OPERATIONAL_TZ}`,
    '',
    `Totals: ${allStats.total} people`,
    formatTotalsBlock('Reposters', reposterStats),
    formatTotalsBlock('Creators', creatorStats),
    '',
    '── REPOSTERS ──',
  ]

  if (reposters.length === 0) {
    lines.push('(none)')
  } else {
    for (const p of reposters) {
      lines.push(formatPersonLine(p, true))
    }
  }

  lines.push('', '── CREATORS (track only) ──')
  if (creators.length === 0) {
    lines.push('(none)')
  } else {
    for (const p of creators) {
      lines.push(formatPersonLine(p, false))
    }
  }

  const templates: string[] = []
  for (const p of reposters) {
    if (p.status === 'partial') {
      templates.push(
        `[${p.name} — partial · ${report.dayLabel}]\n${arabicPartialTemplate(p.name, missingParts(p), report.dayLabel)}`,
      )
    } else if (p.status === 'miss') {
      // After a strike reset, waived rows no longer count — next miss starts at 1 again.
      const strikes = Math.max(p.contractStrikes, 1)
      templates.push(
        `[${p.name} — strike ${strikes}/${p.maxStrikes} · ${report.dayLabel}]\n${arabicStrikeTemplate(p.name, strikes, p.maxStrikes, report.dayLabel)}`,
      )
    }
  }

  if (templates.length > 0) {
    lines.push('', '── COPY TEMPLATES ──', '')
    lines.push(templates.join('\n\n'))
  }

  return lines.join('\n')
}

function formatPersonLine(p: AttendancePerson, withStrikes: boolean): string {
  if (p.status === 'break') return `🏖 ${p.name} — break / rest`
  if (p.status === 'hit') return `✅ ${p.name} — ${countsLine(p)}`
  if (p.status === 'partial') {
    return `⚠️ ${p.name} — ${countsLine(p)}  (need ${missingParts(p)})`
  }
  // miss
  const x = p.missStreak > 0 ? `${p.missStreak}X` : '1X'
  if (withStrikes) {
    return `❌ ${p.name} — ${x} · strikes ${p.contractStrikes}/${p.maxStrikes}`
  }
  return `❌ ${p.name} — no post`
}

export async function sendDailyAttendanceTelegram(opToday: string): Promise<{
  ok: boolean
  day: string
  error?: string
  skipped?: boolean
}> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  if (!telegramConfigured()) {
    return { ok: true, day: lastCompletedOperationalDay(opToday), skipped: true }
  }
  const report = await buildAttendanceReport(opToday)
  const text = formatAttendanceTelegram(report)
  const result = await sendTelegramMessage(text)
  return { ok: result.ok, day: report.day, error: result.error }
}
