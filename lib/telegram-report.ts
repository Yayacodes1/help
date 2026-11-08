import 'server-only'
import { addDays } from '@/lib/campaign'
import { getAttendanceForDay } from '@/lib/attendance'
import { OPERATIONAL_TZ, lastCompletedOperationalDay } from '@/lib/operational-day'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'
import { EMPTY_COUNTS, getLeaderBoard, type LeaderBoard } from '@/lib/leaders'
import {
  peopleInSquad,
  rosterForSquad,
  squadCallbackToken,
  squadMenuTitle,
  squadRoleButtons,
  type ReportSquad,
} from '@/lib/telegram-groups'
import type { DailyViewsCompare } from '@/lib/daily-views'
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

export type DayReportProfile = 'full' | 'slim' | 'lite'

type BuildDayReportOpts = {
  /** full = projects + yesterday + leaders. lite = today + projects (fast update). slim = today only (messages). */
  profile?: DayReportProfile
}

const REPORT_CACHE_TTL_MS = 45_000
const reportCache = new Map<string, { expires: number; value: DayReport }>()

function emptyLeaders(day: string): LeaderBoard {
  return {
    day,
    prevDay: addDays(day, -1),
    all: {
      todayPct: null,
      yesterdayPct: null,
      today: { ...EMPTY_COUNTS },
      yesterday: { ...EMPTY_COUNTS },
    },
    leaders: [],
    unassigned: null,
  }
}

export async function buildDayReport(
  opToday: string,
  mode: ReportMode,
  opts: BuildDayReportOpts = {},
): Promise<DayReport> {
  const profile: DayReportProfile = opts.profile ?? 'full'
  const day = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  const cacheKey = `${mode}:${day}:${profile}`
  const hit = reportCache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.value

  const prevDay = addDays(day, -1)

  if (profile === 'slim') {
    const everyone = await getAttendanceForDay(day)
    const value: DayReport = {
      mode,
      day,
      groups: [],
      everyone,
      leaders: emptyLeaders(day),
      generatedAt: new Date(),
      dailyViews: null,
    }
    reportCache.set(cacheKey, { expires: Date.now() + REPORT_CACHE_TTL_MS, value })
    return value
  }

  const { getAllProjects, getCreatorsWithProgressOnDate } = await import('@/lib/queries')
  const projects = await getAllProjects()
  const lite = profile === 'lite'

  const [everyone, prevEveryone, perProject] = await Promise.all([
    getAttendanceForDay(day),
    lite ? Promise.resolve([] as AttendancePerson[]) : getAttendanceForDay(prevDay),
    Promise.all(
      projects.map(async (project) => {
        if (lite) {
          const members = await getCreatorsWithProgressOnDate(day, project.id, 'creator', {
            projectMembersOnly: true,
          })
          return {
            project,
            creatorIds: new Set(members.map((m) => m.id)),
            postsHere: [] as AttendancePerson[],
          }
        }
        const [members, postsHere] = await Promise.all([
          getCreatorsWithProgressOnDate(day, project.id, 'creator', { projectMembersOnly: true }),
          getAttendanceForDay(day, project.id),
        ])
        return { project, creatorIds: new Set(members.map((m) => m.id)), postsHere }
      }),
    ),
  ])
  const leaders = lite
    ? emptyLeaders(day)
    : await getLeaderBoard(day, { today: everyone, yesterday: prevEveryone })

  const groups: Group[] = perProject.map(({ project, creatorIds }) => {
    const inGroup = (p: AttendancePerson) => p.role === 'creator' && creatorIds.has(p.id)
    const people = everyone.filter(inGroup)
    return {
      label: project.name,
      role: 'creator' as const,
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
    postedFor: lite
      ? undefined
      : perProject.map(({ project, postsHere }) => ({
          projectName: project.name,
          names: postsHere
            .filter((p) => p.role === 'reposter' && p.todayInstagram + p.todayTiktok > 0)
            .map((p) => p.name)
            .sort((a, b) => a.localeCompare(b)),
        })),
  })

  const value: DayReport = {
    mode,
    day,
    groups,
    everyone,
    leaders,
    generatedAt: new Date(),
    dailyViews: null,
  }
  reportCache.set(cacheKey, { expires: Date.now() + REPORT_CACHE_TTL_MS, value })
  // Keep slim cache warm with the same attendance for message taps.
  reportCache.set(`${mode}:${day}:slim`, {
    expires: Date.now() + REPORT_CACHE_TTL_MS,
    value: { ...value, groups: [], dailyViews: null },
  })
  if (!lite) {
    reportCache.set(`${mode}:${day}:lite`, {
      expires: Date.now() + REPORT_CACHE_TTL_MS,
      value: { ...value, leaders: emptyLeaders(day), dailyViews: null },
    })
  }
  return value
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
  '📊 /update — so far today (posted / didn’t / %).\n' +
  '📋 /list — names. ✉️ /messages_creators · /messages_reposters\n' +
  '📅 /yesterday · /today · /now'

export function updateMenuButtons() {
  return {
    inline_keyboard: [
      [{ text: '⏱ So far today', callback_data: 'upd:sofar' }],
      [
        { text: '☀️ Today', callback_data: 'upd:today' },
        { text: '📅 Previous day', callback_data: 'upd:prev' },
      ],
    ],
  }
}

export function updateMenuPrompt(): string {
  return (
    '📊 UPDATE\n' +
    '⏱ So far today — how many posted to this point.\n' +
    '☀️ Today / 📅 Previous day — same counts for that day.'
  )
}

export function reportButtons(mode: ReportMode) {
  return {
    inline_keyboard: [
      [
        { text: '⏱ So far', callback_data: 'upd:sofar' },
        { text: '☀️ Today', callback_data: 'upd:today' },
        { text: '📅 Prev', callback_data: 'upd:prev' },
      ],
      [{ text: '📋 Who posted', callback_data: `list:${mode}` }],
      [
        { text: '✉️ Creators', callback_data: `msgs:creator:${mode}` },
        { text: '✉️ Reposters', callback_data: `msgs:reposter:${mode}` },
      ],
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

/** Counts only: posted / partial / didn't, per project, plus on-plan %. */
export function formatSummary(report: DayReport, flavor: 'default' | 'today' | 'progress' = 'default'): string {
  const titleFlavor = flavor === 'today' ? 'today' : flavor === 'progress' ? 'progress' : 'default'
  const lines: string[] = [`📊 ${dayTitle(report, titleFlavor)}`]
  if (flavor === 'progress') {
    lines.push('', 'TO THIS POINT', videoTotalsLine(report.everyone, 'Everyone: '))
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
      if (now != null) {
        const before = onPlanPct(g.yesterday)
        if (before != null) {
          const diff = now - before
          const trend = diff > 0 ? ` ▲${diff}` : diff < 0 ? ` ▼${-diff}` : ' ='
          const [nowLabel, beforeLabel] =
            report.mode === 'live'
              ? ['today', 'yesterday']
              : [weekday(report.day), weekday(addDays(report.day, -1))]
          lines.push(`   On plan: ${now}% ${nowLabel} · ${before}% ${beforeLabel}${trend}`)
        } else {
          lines.push(`   On plan: ${now}%`)
        }
      }
    }
  }
  return lines.join('\n')
}

function compareLabels(report: DayReport): [string, string] {
  return report.mode === 'live'
    ? ['today', 'yesterday']
    : [weekday(report.day), weekday(addDays(report.day, -1))]
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
    }
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

/** People of that role who still need a reminder (miss / partial). */
export function behindPeople(
  report: DayReport,
  role: ReportRole,
  pool: AttendancePerson[] = report.everyone,
): AttendancePerson[] {
  return pool
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
    .sort((a, b) =>
      a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'miss' ? -1 : 1,
    )
}

/** One copy-ready Telegram message per person of that role who is behind (didn't post first). */
export function buildMessageTemplates(
  report: DayReport,
  role: ReportRole,
  opToday: string,
  pool: AttendancePerson[] = report.everyone,
): string[] {
  const behind = behindPeople(report, role, pool)
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

export function messagePickerPrompt(
  report: DayReport,
  role: ReportRole,
  behindCount: number,
  scope = '',
): string {
  const noun = role === 'creator' ? 'creator' : 'reposter'
  if (behindCount === 0) {
    return `✉️ No ${noun} messages needed${scope} — every ${noun} is done for ${dayTitle(report)}.`
  }
  return (
    `✉️ ${noun.toUpperCase()} MESSAGES${scope} · ${dayTitle(report)}\n` +
    `${behindCount} ${noun}${behindCount === 1 ? '' : 's'} behind.\n` +
    `Tap a name to copy the Arabic reminder (fast). Or Send all if you want every message at once.`
  )
}

/** Streak-style: tap a name → one Arabic reminder. */
export function messagePickerButtons(
  people: AttendancePerson[],
  role: ReportRole,
  mode: ReportMode,
  page = 0,
  squad?: ReportSquad | null,
) {
  const pageSize = 20
  const start = page * pageSize
  const slice = people.slice(start, start + pageSize)
  const squadKey = squad ? squadCallbackToken(squad) : '_'
  const rows = slice.map((p) => {
    const posted = videosPostedToday(p)
    const mark = p.status === 'miss' || posted <= 0 ? '❌' : '⚠️'
    return [
      {
        text: `${mark} ${p.name}`.slice(0, 60),
        callback_data: `msg:${role}:${mode}:${p.id}:${squadKey}`,
      },
    ]
  })
  const nav: Array<{ text: string; callback_data: string }> = []
  if (page > 0) {
    nav.push({ text: '← Prev', callback_data: `msgpage:${role}:${mode}:${page - 1}:${squadKey}` })
  }
  if (start + pageSize < people.length) {
    nav.push({ text: 'Next →', callback_data: `msgpage:${role}:${mode}:${page + 1}:${squadKey}` })
  }
  if (nav.length) rows.push(nav)
  if (people.length > 0) {
    rows.push([
      {
        text: `📤 Send all (${people.length})`,
        callback_data: `msgall:${role}:${mode}:${squadKey}`,
      },
    ])
  }
  rows.push([{ text: '🔄 Refresh menu', callback_data: 'upd' }])
  return { inline_keyboard: rows }
}

export function formatOneBehindMessage(
  report: DayReport,
  person: AttendancePerson,
  opToday: string,
  index?: number,
  total?: number,
): string | null {
  const body = arabicTemplate(person, report, opToday)
  if (!body) return null
  const noun = person.role === 'creator' ? 'Creator' : 'Reposter'
  const posted = videosPostedToday(person)
  const state =
    person.status === 'miss' || posted <= 0 ? "❌ didn't post" : `⚠️ needs ${missingEn(person)}`
  const head =
    index != null && total != null
      ? `<b>${index}/${total} · ${escapeHtml(person.name)}</b>`
      : `<b>${escapeHtml(person.name)}</b>`
  return `${head} · ${noun} · ${state}\n\n<pre>${escapeHtml(body)}</pre>\n\n<i>Copy the message above, then send it to them.</i>`
}

/** Pack several HTML people-blocks into fewer Telegram messages (group rate limits). */
export function packHtmlMessages(parts: string[], maxLen: number): string[] {
  if (parts.length === 0) return []
  const out: string[] = []
  let buf = ''
  for (const part of parts) {
    const next = buf ? `${buf}\n\n————\n\n${part}` : part
    if (next.length <= maxLen) {
      buf = next
      continue
    }
    if (buf) out.push(buf)
    if (part.length <= maxLen) {
      buf = part
    } else {
      out.push(part)
      buf = ''
    }
  }
  if (buf) out.push(buf)
  return out
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
    /** Dump every reminder as messages (default: name picker). */
    dumpAll?: boolean
    /** Picker page when sending the button list. */
    page?: number
  } = {},
): Promise<{ ok: boolean; day: string; error?: string; skipped?: boolean; messages?: number }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  const day = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  if (!telegramConfigured()) return { ok: true, day, skipped: true }
  const {
    chatId,
    view = 'summary',
    role = 'creator',
    squad,
    flavor = 'default',
    dumpAll = false,
    page = 0,
  } = opts

  // Messages: today only. Update/list: lite (no yesterday/leaders/views). Squad needs full.
  const profile: DayReportProfile =
    squad ? 'full' : view === 'messages' ? 'slim' : 'lite'
  const report = await buildDayReport(opToday, mode, { profile })
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

  const pool = squad
    ? peopleInSquad(report.everyone, report.leaders, squad, role)
    : report.everyone.filter((p) => p.role === role)
  const noun = role === 'creator' ? 'creator' : 'reposter'
  if (squad && pool.length === 0) {
    const res = await sendTelegramMessage(`✉️ No ${noun}s in ${squadMenuTitle(squad)}.`, {
      chatId,
      replyMarkup: buttons,
    })
    return { ok: res.ok, day: report.day, error: res.error, messages: 0 }
  }

  const behind = behindPeople(report, role, pool)

  // Default: fast picker (tap a name). Send all only when asked.
  if (!dumpAll) {
    const res = await sendTelegramMessage(messagePickerPrompt(report, role, behind.length, scope), {
      chatId,
      replyMarkup: messagePickerButtons(behind, role, mode, page, squad),
    })
    return { ok: res.ok, day: report.day, error: res.error, messages: 0 }
  }

  const templates = buildMessageTemplates(report, role, opToday, pool)
  const errors: Array<string | undefined> = []
  let sent = 0
  const inGroup = String(chatId ?? process.env.TELEGRAM_CHAT_ID ?? '').startsWith('-')

  if (templates.length > 0) {
    const head = await sendTelegramMessage(
      `✉️ ${noun.toUpperCase()} MESSAGES${scope} · ${dayTitle(report)}\n` +
        `${templates.length} ${noun}${templates.length === 1 ? '' : 's'} behind — sending now…`,
      { chatId },
    )
    errors.push(head.error)
    // Pack hard; only brief gap in groups. Retry on 429 is handled in sendTelegramMessage.
    const packed = packHtmlMessages(templates, 3500)
    const gapMs = inGroup ? 400 : 150
    for (const html of packed) {
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
      const res = await sendTelegramMessage(html, { chatId, parseMode: 'HTML' })
      if (res.ok) sent++
      else errors.push(res.error)
    }
  }

  const footer =
    templates.length === 0
      ? `✉️ No ${noun} messages needed${scope} — every ${noun} is done for ${dayTitle(report)}.`
      : `✅ That's all ${templates.length} ${noun} messages${scope}.`
  const tail = await sendTelegramMessage(footer, {
    chatId,
    replyMarkup: messagePickerButtons(behind, role, mode, 0, squad),
  })
  errors.push(tail.error)

  const error = errors.filter(Boolean).join(' · ') || undefined
  return { ok: !error, day: report.day, error, messages: sent }
}

/** One person reminder from a picker tap. */
export async function sendBehindPersonMessage(
  opToday: string,
  mode: ReportMode,
  role: ReportRole,
  creatorId: number,
  chatId?: string | number,
  squad?: ReportSquad | null,
): Promise<{ ok: boolean; error?: string }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  if (!telegramConfigured()) return { ok: true }
  const report = await buildDayReport(opToday, mode, {
    profile: squad ? 'full' : 'slim',
  })
  const person = report.everyone.find((p) => p.id === creatorId && p.role === role)
  if (!person) {
    return sendTelegramMessage('That person was not found on this day’s list.', { chatId })
  }
  const pool = squad
    ? peopleInSquad(report.everyone, report.leaders, squad, role)
    : report.everyone.filter((p) => p.role === role)
  const behind = behindPeople(report, role, pool)
  const html = formatOneBehindMessage(report, person, opToday)
  if (!html) {
    return sendTelegramMessage('No reminder text for that person.', { chatId })
  }
  return sendTelegramMessage(html, {
    chatId,
    parseMode: 'HTML',
    replyMarkup: messagePickerButtons(behind, role, mode, 0, squad),
  })
}
