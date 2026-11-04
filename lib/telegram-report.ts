import 'server-only'
import { addDays } from '@/lib/campaign'
import { getAttendanceForDay } from '@/lib/attendance'
import { OPERATIONAL_TZ, lastCompletedOperationalDay } from '@/lib/operational-day'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'
import { formatPlanCompare, getLeaderBoard, type LeaderBoard, type LeaderScore } from '@/lib/leaders'
import {
  peopleInSquad,
  rosterForSquad,
  squadMenuTitle,
  squadRoleButtons,
  type ReportSquad,
} from '@/lib/telegram-groups'
import { formatDailyViewsSection, type DailyViewsCompare } from '@/lib/daily-views'
import { formatCreatorReminder } from '@/lib/telegram-reminder'

/**
 * `final`: the day that just closed at midnight Riyadh (sent at 12:00 AM).
 * `live`: today so far (sent at 5 PM Riyadh, or on demand from the bot).
 */
export type ReportMode = 'final' | 'live'
export type ReportRole = 'creator' | 'reposter'
/** `progress` = today so far with video totals (how much posted to this point). */
export type ReportView = 'summary' | 'list' | 'messages' | 'progress'

type Counts = { posted: number; partial: number; missed: number; away: number; late: number }

/**
 * Goals are a daily total across projects, so plan status is per person (all projects).
 * Creators get a group per home project; reposters work for every project, so one group
 * plus who posted for each project.
 */
type Group = {
  label: string
  role: ReportRole
  people: AttendancePerson[]
  today: Counts
  yesterday: Counts
  postedFor?: Array<{ projectName: string; names: string[] }>
}

export type DayReport = {
  mode: ReportMode
  day: string
  groups: Group[]
  /** Everyone, all projects combined (drives the copy-ready messages). */
  everyone: AttendancePerson[]
  leaders: LeaderBoard
  generatedAt: Date
  dailyViews: DailyViewsCompare | null
}

function addStatus(c: Counts, status: AttendanceStatus) {
  if (status === 'hit') c.posted++
  else if (status === 'late') c.late++
  else if (status === 'partial') c.partial++
  else if (status === 'break' || status === 'off') c.away++
  else c.missed++
}

function countStatuses(people: AttendancePerson[]): Counts {
  const c: Counts = { posted: 0, partial: 0, missed: 0, away: 0, late: 0 }
  for (const p of people) addStatus(c, p.status)
  return c
}

function yesterdayCounts(report: DayReport, squad: ReportSquad, role: ReportRole): Counts {
  const c: Counts = { posted: 0, partial: 0, missed: 0, away: 0, late: 0 }
  for (const p of rosterForSquad(report.leaders, squad)) {
    if (p.role !== role || p.yesterdayStatus == null) continue
    addStatus(c, p.yesterdayStatus)
  }
  return c
}

function countsLine(c: Counts, label = ''): string {
  if (c.posted + c.late + c.partial + c.missed + c.away === 0) return `${label}nobody`
  const away = c.away > 0 ? ` · 🏖 ${c.away}` : ''
  const late = c.late > 0 ? ` · ⏰ ${c.late} late` : ''
  return `${label}✅ ${c.posted} posted${late} · ⚠️ ${c.partial} partial · ❌ ${c.missed} didn't${away}`
}

function onPlanLine(report: DayReport, today: Counts, yesterday: Counts): string | null {
  const now = onPlanPct(today)
  if (now == null) return null
  const before = onPlanPct(yesterday)
  const diff = before != null ? now - before : null
  const trend = diff == null ? '' : diff > 0 ? ` ▲${diff}` : diff < 0 ? ` ▼${-diff}` : ' ='
  const [nowLabel, beforeLabel] = compareLabels(report)
  return `   On plan: ${now}% ${nowLabel} · ${before ?? '–'}% ${beforeLabel}${trend}`
}

/** Share of people (not on break) who hit their full plan. */
function onPlanPct(c: Counts): number | null {
  const total = c.posted + c.late + c.partial + c.missed
  return total > 0 ? Math.round(((c.posted + c.late) / total) * 100) : null
}

export async function buildDayReport(opToday: string, mode: ReportMode): Promise<DayReport> {
  const { getAllProjects, getCreatorsWithProgressOnDate } = await import('@/lib/queries')
  const day = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  const prevDay = addDays(day, -1)
  const projects = await getAllProjects()

  const [everyone, prevEveryone, perProject] = await Promise.all([
    getAttendanceForDay(day),
    getAttendanceForDay(prevDay),
    Promise.all(
      projects.map(async (project) => {
        const [members, postsHere] = await Promise.all([
          getCreatorsWithProgressOnDate(day, project.id, 'creator', { projectMembersOnly: true }),
          getAttendanceForDay(day, project.id),
        ])
        return { project, creatorIds: new Set(members.map((m) => m.id)), postsHere }
      }),
    ),
  ])
  const leaders = await getLeaderBoard(day, { today: everyone, yesterday: prevEveryone })

  const groups: Group[] = perProject.map(({ project, creatorIds }) => {
    const inGroup = (p: AttendancePerson) => p.role === 'creator' && creatorIds.has(p.id)
    const people = everyone.filter(inGroup)
    return {
      label: project.name,
      role: 'creator',
      people,
      today: countStatuses(people),
      yesterday: countStatuses(prevEveryone.filter(inGroup)),
    }
  })

  const reposters = everyone.filter((p) => p.role === 'reposter')
  groups.push({
    label: 'All projects',
    role: 'reposter',
    people: reposters,
    today: countStatuses(reposters),
    yesterday: countStatuses(prevEveryone.filter((p) => p.role === 'reposter')),
    postedFor: perProject.map(({ project, postsHere }) => ({
      projectName: project.name,
      names: postsHere
        .filter((p) => p.role === 'reposter' && p.todayInstagram + p.todayTiktok > 0)
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b)),
    })),
  })

  let dailyViews: DailyViewsCompare | null = null
  try {
    const { loadDailyViewsCompare } = await import('@/lib/daily-views-store')
    dailyViews = await loadDailyViewsCompare(day, mode)
  } catch {
    dailyViews = null
  }

  return { mode, day, groups, everyone, leaders, generatedAt: new Date(), dailyViews }
}

function enDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function weekday(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

function arDay(ymd: string): string {
  return new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).format(new Date(`${ymd}T12:00:00Z`))
}

function riyadhTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: OPERATIONAL_TZ })
}

function dayTitle(report: DayReport, flavor: 'default' | 'today' | 'progress' = 'default'): string {
  if (report.mode === 'final') return `${enDay(report.day)} (previous day · final)`
  if (flavor === 'today') return `${enDay(report.day)} — today`
  if (flavor === 'progress') {
    return `${enDay(report.day)} so far (${riyadhTime(report.generatedAt)} Riyadh)`
  }
  return `${enDay(report.day)} so far (${riyadhTime(report.generatedAt)} Riyadh)`
}

function missingEn(p: AttendancePerson): string {
  const parts: string[] = []
  if (p.goalInstagram > 0 && p.todayInstagram < p.goalInstagram) parts.push(`IG ${p.goalInstagram - p.todayInstagram}`)
  if (p.goalTiktok > 0 && p.todayTiktok < p.goalTiktok) parts.push(`TT ${p.goalTiktok - p.todayTiktok}`)
  return parts.join(' + ')
}

function missingAr(p: AttendancePerson): string {
  const parts: string[] = []
  if (p.goalInstagram > 0 && p.todayInstagram < p.goalInstagram) {
    parts.push(`انستقرام ${p.goalInstagram - p.todayInstagram}`)
  }
  if (p.goalTiktok > 0 && p.todayTiktok < p.goalTiktok) {
    parts.push(`تيك توك ${p.goalTiktok - p.todayTiktok}`)
  }
  return parts.join(' و') || 'إكمال الهدف'
}

const ROLE_TITLE: Record<ReportRole, string> = { creator: '🎬 CREATORS', reposter: '🔁 REPOSTERS' }

export const BUTTON_GUIDE =
  'WHAT YOU CAN DO\n' +
  '📊 Type /update — pick Previous day, Today, or So far today.\n' +
  '📋 Full list — names: who posted, partial, didn\'t post (same day). Or type /list\n' +
  '✉️ Creators — a copy-ready Arabic message for each creator who is behind. Or type /messages_creators\n' +
  '✉️ Reposters — the same for reposters. Or type /messages_reposters\n' +
  '⚠️ Creator streaks — first / second / final streak list. Tap a name to copy the message. Or type /streaks\n' +
  '👑 Group Leader — pick Alpha / Beta / Charlie / Delta, then Update, List, Creators reminder, or Reposter reminder. Or type /groups\n' +
  '📅 Type /yesterday for the previous day. /today for the day we\'re in. /now for so far today.'

export function updateMenuButtons() {
  return {
    inline_keyboard: [
      [{ text: '📅 Previous day', callback_data: 'upd:prev' }],
      [{ text: '☀️ Today', callback_data: 'upd:today' }],
      [{ text: '⏱ So far today', callback_data: 'upd:sofar' }],
    ],
  }
}

export function updateMenuPrompt(): string {
  return (
    '📊 WHICH UPDATE?\n' +
    '📅 Previous day — the day that already ended (late posts included).\n' +
    '☀️ Today — the day we are in right now (who posted / partial / not yet).\n' +
    '⏱ So far today — to this point: how many videos posted vs plan.'
  )
}

export function reportButtons(mode: ReportMode) {
  return {
    inline_keyboard: [
      [
        { text: '📅 Previous day', callback_data: 'upd:prev' },
        { text: '☀️ Today', callback_data: 'upd:today' },
        { text: '⏱ So far', callback_data: 'upd:sofar' },
      ],
      [{ text: '📋 Full list', callback_data: `list:${mode}` }],
      [
        { text: '✉️ Creators', callback_data: `msgs:creator:${mode}` },
        { text: '✉️ Reposters', callback_data: `msgs:reposter:${mode}` },
      ],
      [{ text: '⚠️ Creator streaks', callback_data: 'pstreaks' }],
      [{ text: '👑 Group Leader', callback_data: `gl:${mode}` }],
    ],
  }
}

function videoTotals(people: AttendancePerson[]): { posted: number; goal: number; ig: number; igGoal: number; tt: number; ttGoal: number } {
  let posted = 0
  let goal = 0
  let ig = 0
  let igGoal = 0
  let tt = 0
  let ttGoal = 0
  for (const p of people) {
    if (p.status === 'break' || p.status === 'off') continue
    ig += Math.max(0, p.todayInstagram)
    igGoal += Math.max(0, p.goalInstagram)
    tt += Math.max(0, p.todayTiktok)
    ttGoal += Math.max(0, p.goalTiktok)
    posted += Math.max(0, p.todayInstagram) + Math.max(0, p.todayTiktok)
    goal += Math.max(0, p.goalInstagram) + Math.max(0, p.goalTiktok)
  }
  return { posted, goal, ig, igGoal, tt, ttGoal }
}

function videoTotalsLine(people: AttendancePerson[], label = ''): string {
  const t = videoTotals(people)
  if (t.goal === 0 && t.posted === 0) return `${label}no plan yet`
  return `${label}🎬 ${t.posted}/${t.goal} videos · IG ${t.ig}/${t.igGoal} · TT ${t.tt}/${t.ttGoal}`
}

/** Counts only: posted / partial / didn't, per project, plus on-plan % today vs yesterday. */
export function formatSummary(report: DayReport, flavor: 'default' | 'today' | 'progress' = 'default'): string {
  const titleFlavor = flavor === 'today' ? 'today' : flavor === 'progress' ? 'progress' : 'default'
  const lines: string[] = [`📊 ${dayTitle(report, titleFlavor)}`]
  if (flavor === 'progress') {
    lines.push('', 'TO THIS POINT', videoTotalsLine(report.everyone, 'Everyone: '))
  }
  if (report.dailyViews) {
    lines.push('', formatDailyViewsSection(report.dailyViews))
  }
  for (const role of ['creator', 'reposter'] as const) {
    lines.push('', ROLE_TITLE[role])
    for (const g of report.groups.filter((x) => x.role === role)) {
      const c = g.today
      const label = role === 'reposter' ? '' : `${g.label}: `
      if (flavor === 'progress') {
        lines.push(videoTotalsLine(g.people, label))
      }
      if (c.posted + c.late + c.partial + c.missed + c.away === 0) {
        lines.push(`${label}nobody`)
        continue
      }
      const away = c.away > 0 ? ` · 🏖 ${c.away}` : ''
      const late = c.late > 0 ? ` · ⏰ ${c.late} late` : ''
      const missLabel = report.mode === 'live' ? 'not yet' : "didn't"
      lines.push(`${label}✅ ${c.posted} posted${late} · ⚠️ ${c.partial} partial · ❌ ${c.missed} ${missLabel}${away}`)
      const now = onPlanPct(c)
      const before = onPlanPct(g.yesterday)
      if (now != null) {
        const diff = before != null ? now - before : null
        const trend = diff == null ? '' : diff > 0 ? ` ▲${diff}` : diff < 0 ? ` ▼${-diff}` : ' ='
        const [nowLabel, beforeLabel] =
          report.mode === 'live'
            ? ['today', 'yesterday']
            : [weekday(report.day), weekday(addDays(report.day, -1))]
        lines.push(`   On plan: ${now}% ${nowLabel} · ${before ?? '–'}% ${beforeLabel}${trend}`)
      }
      if (g.postedFor) {
        lines.push(`   Posted for ${g.postedFor.map((x) => `${x.projectName} ${x.names.length}`).join(' · ')}`)
      }
    }
  }
  lines.push('', ...leaderSummaryLines(report))
  lines.push('', BUTTON_GUIDE)
  return lines.join('\n')
}

function compareLabels(report: DayReport): [string, string] {
  return report.mode === 'live'
    ? ['today', 'yesterday']
    : [weekday(report.day), weekday(addDays(report.day, -1))]
}

function leaderScoreLine(rank: string, row: LeaderScore, todayLabel: string, yesterdayLabel: string): string {
  const plan = formatPlanCompare(row.todayPct, row.yesterdayPct, todayLabel, yesterdayLabel)
  const late = row.today.late > 0 ? ` · ⏰ ${row.today.late}` : ''
  const counts = `✅ ${row.today.posted}${late} · ⚠️ ${row.today.partial} · ❌ ${row.today.missed}`
  const checked = row.leaderId == null ? '' : ` · checked ${row.checks}/${row.roster}`
  const reposter =
    row.reposterName == null
      ? ''
      : row.reposterStatus === 'hit'
        ? ' · reposter posted'
        : ' · reposter not on plan'
  return `${rank} ${row.name} — ${plan} · ${counts}${checked}${reposter}`
}

function leaderSummaryLines(report: DayReport): string[] {
  const [todayLabel, yesterdayLabel] = compareLabels(report)
  const lines = [
    '👑 LEADERS',
    `All creators — ${formatPlanCompare(report.leaders.all.todayPct, report.leaders.all.yesterdayPct, todayLabel, yesterdayLabel)}`,
  ]
  if (report.leaders.leaders.length === 0) {
    lines.push('No leaders yet')
  } else {
    report.leaders.leaders.forEach((row, index) => {
      lines.push(leaderScoreLine(`${index + 1}.`, row, todayLabel, yesterdayLabel))
    })
  }
  if (report.leaders.unassigned) {
    lines.push(leaderScoreLine('—', report.leaders.unassigned, todayLabel, yesterdayLabel))
  }
  return lines
}

function nameList(people: AttendancePerson[], withMissing = false): string {
  return people
    .map((p) => (withMissing && missingEn(p) ? `${p.name} (needs ${missingEn(p)})` : p.name))
    .join(', ')
}

/** Every name for the same day: posted / partial / didn't, per project and role. */
export function formatFullList(report: DayReport): string {
  const live = report.mode === 'live'
  const lines: string[] = [`📋 FULL LIST · ${dayTitle(report)}`]
  for (const role of ['creator', 'reposter'] as const) {
    lines.push('', ROLE_TITLE[role])
    for (const g of report.groups.filter((x) => x.role === role)) {
      const byName = [...g.people].sort((a, b) => a.name.localeCompare(b.name))
      const of = (s: AttendanceStatus) => byName.filter((p) => p.status === s)
      if (role === 'creator') lines.push(`— ${g.label} —`)
      if (byName.length === 0) {
        lines.push('nobody')
        continue
      }
      if (of('hit').length) lines.push(`✅ Posted (${of('hit').length}): ${nameList(of('hit'))}`)
      if (of('late').length) lines.push(`⏰ Late (${of('late').length}): ${nameList(of('late'))}`)
      if (of('partial').length) lines.push(`⚠️ Partial (${of('partial').length}): ${nameList(of('partial'), true)}`)
      if (of('miss').length) {
        lines.push(`❌ ${live ? 'Not yet' : "Didn't post"} (${of('miss').length}): ${nameList(of('miss'))}`)
      }
      if (of('break').length) lines.push(`🏖 Break (${of('break').length}): ${nameList(of('break'))}`)
      if (of('off').length) lines.push(`💤 Off day (${of('off').length}): ${nameList(of('off'))}`)
      for (const x of g.postedFor ?? []) {
        lines.push(`📌 Posted for ${x.projectName} (${x.names.length}): ${x.names.join(', ') || '—'}`)
      }
    }
  }
  lines.push('', ...leaderSummaryLines(report))
  for (const row of report.leaders.leaders) {
    const behind = row.people.filter((p) => p.status === 'miss' || p.status === 'partial')
    if (behind.length === 0) continue
    lines.push(
      `   ${row.name} still open: ${behind.map((p) => `${p.name} (${p.status === 'miss' ? 'no post' : 'partial'})`).join(', ')}`,
    )
  }
  return lines.join('\n')
}

function formatSquadSummary(report: DayReport, squad: ReportSquad): string {
  const title = squadMenuTitle(squad)
  const lines: string[] = [`📊 ${title} · ${dayTitle(report)}`]
  for (const role of ['creator', 'reposter'] as const) {
    const people = peopleInSquad(report.everyone, report.leaders, squad, role)
    const today = countStatuses(people)
    lines.push('', ROLE_TITLE[role], countsLine(today))
    const plan = onPlanLine(report, today, yesterdayCounts(report, squad, role))
    if (plan) lines.push(plan)
  }
  return lines.join('\n')
}

function formatSquadList(report: DayReport, squad: ReportSquad): string {
  const live = report.mode === 'live'
  const title = squadMenuTitle(squad)
  const lines: string[] = [`📋 ${title} · ${dayTitle(report)}`]
  for (const role of ['creator', 'reposter'] as const) {
    const byName = [...peopleInSquad(report.everyone, report.leaders, squad, role)].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const of = (s: AttendanceStatus) => byName.filter((p) => p.status === s)
    lines.push('', ROLE_TITLE[role])
    if (byName.length === 0) {
      lines.push('nobody')
      continue
    }
    if (of('hit').length) lines.push(`✅ Posted (${of('hit').length}): ${nameList(of('hit'))}`)
    if (of('late').length) lines.push(`⏰ Late (${of('late').length}): ${nameList(of('late'))}`)
    if (of('partial').length) lines.push(`⚠️ Partial (${of('partial').length}): ${nameList(of('partial'), true)}`)
    if (of('miss').length) {
      lines.push(`❌ ${live ? 'Not yet' : "Didn't post"} (${of('miss').length}): ${nameList(of('miss'))}`)
    }
    if (of('break').length) lines.push(`🏖 Break (${of('break').length}): ${nameList(of('break'))}`)
    if (of('off').length) lines.push(`💤 Off day (${of('off').length}): ${nameList(of('off'))}`)
  }
  return lines.join('\n')
}

function videosPostedToday(p: AttendancePerson): number {
  return Math.max(0, p.todayInstagram) + Math.max(0, p.todayTiktok)
}

function videosNeededToday(p: AttendancePerson): number {
  return Math.max(0, p.goalInstagram) + Math.max(0, p.goalTiktok)
}

function arabicTemplate(p: AttendancePerson, report: DayReport, opToday: string): string | null {
  if (p.role === 'creator') {
    return formatCreatorReminder(p.name, videosPostedToday(p), videosNeededToday(p), arDay(report.day))
  }
  const deadline = 'قبل الساعة 12 منتصف الليل بتوقيت السعودية'
  const lines: string[] = []
  if (report.mode === 'live') {
    if (p.status === 'miss') {
      lines.push(`مرحباً ${p.name}، تذكير لطيف: لم تنشر اليوم (${arDay(report.day)}) بعد.`)
      lines.push(`يرجى النشر اليوم ${deadline}.`)
    } else {
      lines.push(`مرحباً ${p.name}، ما زال ينقصك اليوم: ${missingAr(p)}.`)
      lines.push(`يرجى الإكمال ${deadline}.`)
    }
  } else {
    if (p.status === 'miss') {
      lines.push(`مرحباً ${p.name}، لاحظنا أنك لم تنشر يوم ${arDay(report.day)}.`)
    } else {
      lines.push(`مرحباً ${p.name}، لم تكتمل منشورات يوم ${arDay(report.day)} — كان ينقصك: ${missingAr(p)}.`)
    }
    lines.push(`يرجى النشر اليوم (${arDay(opToday)}) ${deadline}.`)
    if (p.role === 'reposter' && p.status === 'miss' && p.contractId != null) {
      const strikes = Math.max(p.contractStrikes, 1)
      const left = Math.max(0, p.maxStrikes - strikes)
      lines.push(
        left > 0
          ? `هذا الإنذار رقم ${strikes} من ${p.maxStrikes} — متبقي لديك ${left}.`
          : `هذا الإنذار رقم ${strikes} من ${p.maxStrikes}، وقد استُهلكت كل الإنذارات. إذا تكرر التأخير قد نتوقف عن العمل معك.`,
      )
    }
  }
  lines.push('إذا واجهت أي مشكلة، أخبرنا.')
  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** One copy-ready Telegram message per person of that role who is behind (didn't post first). */
export function buildMessageTemplates(
  report: DayReport,
  role: ReportRole,
  opToday: string,
  pool: AttendancePerson[] = report.everyone,
): string[] {
  const behind = pool
    .filter((p) => {
      if (p.role !== role) return false
      if (p.status !== 'miss' && p.status !== 'partial') return false
      if (role === 'creator') {
        const needed = videosNeededToday(p)
        const posted = videosPostedToday(p)
        if (needed > 0 && posted >= needed) return false
      }
      return true
    })
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'miss' ? -1 : 1))
  const noun = role === 'creator' ? 'Creator' : 'Reposter'
  const rows: Array<{ p: AttendancePerson; body: string }> = []
  for (const p of behind) {
    const body = arabicTemplate(p, report, opToday)
    if (body) rows.push({ p, body })
  }
  return rows.map(({ p, body }, i) => {
    const posted = videosPostedToday(p)
    const state =
      p.status === 'miss' || posted <= 0 ? "❌ didn't post" : `⚠️ needs ${missingEn(p)}`
    return (
      `<b>${i + 1}/${rows.length} · ${escapeHtml(p.name)}</b> · ${noun} · ${state}\n\n` +
      escapeHtml(body)
    )
  })
}

/**
 * `summary` (default, used by the 5 PM / 12 AM jobs): counts only + buttons.
 * `progress`: today so far with video totals (how much posted to this point).
 * `list`: every name for the same day.
 * `messages`: one copy-ready Arabic message per person of `role` who is behind.
 */
export async function sendAttendanceReports(
  opToday: string,
  mode: ReportMode,
  opts: {
    chatId?: string | number
    view?: ReportView
    role?: ReportRole
    squad?: ReportSquad
    /** How to title a live summary: today vs so-far progress. */
    flavor?: 'default' | 'today' | 'progress'
  } = {},
): Promise<{ ok: boolean; day: string; error?: string; skipped?: boolean; messages?: number }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  const day = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  if (!telegramConfigured()) return { ok: true, day, skipped: true }
  const { chatId, view = 'summary', role = 'creator', squad, flavor = 'default' } = opts

  const report = await buildDayReport(opToday, mode)
  const buttons = squad ? squadRoleButtons(squad, mode) : reportButtons(mode)
  const scope = squad ? ` · ${squadMenuTitle(squad)}` : ''

  if (view === 'summary' || view === 'list' || view === 'progress') {
    const summaryFlavor =
      view === 'progress' ? 'progress' : flavor === 'today' ? 'today' : flavor === 'progress' ? 'progress' : 'default'
    const text = squad
      ? view === 'list'
        ? formatSquadList(report, squad)
        : formatSquadSummary(report, squad) +
          (view === 'progress' || summaryFlavor === 'progress'
            ? `\n\nTO THIS POINT\n${videoTotalsLine(peopleInSquad(report.everyone, report.leaders, squad), 'This group: ')}`
            : '')
      : view === 'list'
        ? formatFullList(report)
        : formatSummary(report, summaryFlavor)
    const res = await sendTelegramMessage(text, { chatId, replyMarkup: buttons })
    return { ok: res.ok, day: report.day, error: res.error }
  }

  const pool = squad ? peopleInSquad(report.everyone, report.leaders, squad, role) : undefined
  const noun = role === 'creator' ? 'creator' : 'reposter'
  if (squad && (pool?.length ?? 0) === 0) {
    const res = await sendTelegramMessage(
      `✉️ No ${noun}s in ${squadMenuTitle(squad)}.\n\n${BUTTON_GUIDE}`,
      { chatId, replyMarkup: buttons },
    )
    return { ok: res.ok, day: report.day, error: res.error, messages: 0 }
  }

  const templates = buildMessageTemplates(report, role, opToday, pool)
  const errors: Array<string | undefined> = []
  let sent = 0

  if (templates.length > 0) {
    const head = await sendTelegramMessage(
      `✉️ ${noun.toUpperCase()} MESSAGES${scope} · ${dayTitle(report)}\n` +
        `${templates.length} ${noun}${templates.length === 1 ? '' : 's'} behind. Copy the reminder below.`,
      { chatId },
    )
    errors.push(head.error)
    // Groups allow ~20 bot messages a minute; private chats are much faster.
    const gapMs = String(chatId ?? process.env.TELEGRAM_CHAT_ID ?? '').startsWith('-') ? 3100 : 400
    for (const html of templates) {
      await new Promise((r) => setTimeout(r, gapMs))
      const res = await sendTelegramMessage(html, { chatId, parseMode: 'HTML' })
      if (res.ok) sent++
      else errors.push(res.error)
    }
  }

  const footer =
    templates.length === 0
      ? `✉️ No ${noun} messages needed${scope} — every ${noun} is done for ${dayTitle(report)}.`
      : `✅ That's all ${templates.length} ${noun} messages${scope}.`
  const tail = await sendTelegramMessage(`${footer}\n\n${BUTTON_GUIDE}`, { chatId, replyMarkup: buttons })
  errors.push(tail.error)

  const error = errors.filter(Boolean).join(' · ') || undefined
  return { ok: !error, day: report.day, error, messages: sent }
}
