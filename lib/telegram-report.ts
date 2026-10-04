import 'server-only'
import { addDays } from '@/lib/campaign'
import { getAttendanceForDay } from '@/lib/attendance'
import { OPERATIONAL_TZ, lastCompletedOperationalDay } from '@/lib/operational-day'
import type { AttendancePerson, AttendanceStatus } from '@/lib/attendance-types'

/**
 * `final`: the day that just closed at midnight Riyadh (sent at 12:00 AM).
 * `live`: today so far (sent at 5 PM Riyadh, or on demand from the bot).
 */
export type ReportMode = 'final' | 'live'
export type ReportRole = 'creator' | 'reposter'
export type ReportView = 'summary' | 'list' | 'messages'

type Counts = { posted: number; partial: number; missed: number; away: number }

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
  generatedAt: Date
}

function countStatuses(people: AttendancePerson[]): Counts {
  const c: Counts = { posted: 0, partial: 0, missed: 0, away: 0 }
  for (const p of people) {
    if (p.status === 'hit') c.posted++
    else if (p.status === 'partial') c.partial++
    else if (p.status === 'break' || p.status === 'off') c.away++
    else c.missed++
  }
  return c
}

/** Share of people (not on break) who hit their full plan. */
function onPlanPct(c: Counts): number | null {
  const total = c.posted + c.partial + c.missed
  return total > 0 ? Math.round((c.posted / total) * 100) : null
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

  return { mode, day, groups, everyone, generatedAt: new Date() }
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

function dayTitle(report: DayReport): string {
  return report.mode === 'live'
    ? `${enDay(report.day)} so far (${riyadhTime(report.generatedAt)} Riyadh)`
    : `${enDay(report.day)} (final)`
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
  '📋 Full list — names: who posted, partial, didn\'t post (same day). Or type /list\n' +
  '✉️ Creators — a copy-ready Arabic message for each creator who is behind. Or type /messages_creators\n' +
  '✉️ Reposters — the same for reposters. Or type /messages_reposters\n' +
  '📊 Type /update any time for today so far.'

export function reportButtons(mode: ReportMode) {
  return {
    inline_keyboard: [
      [{ text: '📋 Full list', callback_data: `list:${mode}` }],
      [
        { text: '✉️ Creators', callback_data: `msgs:creator:${mode}` },
        { text: '✉️ Reposters', callback_data: `msgs:reposter:${mode}` },
      ],
    ],
  }
}

/** Counts only: posted / partial / didn't, per project, plus on-plan % today vs yesterday. */
export function formatSummary(report: DayReport): string {
  const lines: string[] = [`📊 ${dayTitle(report)}`]
  for (const role of ['creator', 'reposter'] as const) {
    lines.push('', ROLE_TITLE[role])
    for (const g of report.groups.filter((x) => x.role === role)) {
      const c = g.today
      const label = role === 'reposter' ? '' : `${g.label}: `
      if (c.posted + c.partial + c.missed + c.away === 0) {
        lines.push(`${label}nobody`)
        continue
      }
      const away = c.away > 0 ? ` · 🏖 ${c.away}` : ''
      lines.push(`${label}✅ ${c.posted} posted · ⚠️ ${c.partial} partial · ❌ ${c.missed} didn't${away}`)
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
  lines.push('', BUTTON_GUIDE)
  return lines.join('\n')
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
  return lines.join('\n')
}

function arabicTemplate(p: AttendancePerson, report: DayReport, opToday: string): string {
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
export function buildMessageTemplates(report: DayReport, role: ReportRole, opToday: string): string[] {
  const behind = report.everyone
    .filter((p) => p.role === role && (p.status === 'miss' || p.status === 'partial'))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'miss' ? -1 : 1))
  const noun = role === 'creator' ? 'Creator' : 'Reposter'
  return behind.map((p, i) => {
    const state = p.status === 'miss' ? "❌ didn't post" : `⚠️ needs ${missingEn(p)}`
    return (
      `<b>${i + 1}/${behind.length} · ${escapeHtml(p.name)}</b> · ${noun} · ${state}\n` +
      `<pre>${escapeHtml(arabicTemplate(p, report, opToday))}</pre>`
    )
  })
}

/**
 * `summary` (default, used by the 5 PM / 12 AM jobs): counts only + buttons.
 * `list`: every name for the same day.
 * `messages`: one copy-ready Arabic message per person of `role` who is behind.
 */
export async function sendAttendanceReports(
  opToday: string,
  mode: ReportMode,
  opts: { chatId?: string | number; view?: ReportView; role?: ReportRole } = {},
): Promise<{ ok: boolean; day: string; error?: string; skipped?: boolean; messages?: number }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  const day = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  if (!telegramConfigured()) return { ok: true, day, skipped: true }
  const { chatId, view = 'summary', role = 'creator' } = opts

  const report = await buildDayReport(opToday, mode)
  const buttons = reportButtons(mode)

  if (view === 'summary' || view === 'list') {
    const text = view === 'summary' ? formatSummary(report) : formatFullList(report)
    const res = await sendTelegramMessage(text, { chatId, replyMarkup: buttons })
    return { ok: res.ok, day: report.day, error: res.error }
  }

  const templates = buildMessageTemplates(report, role, opToday)
  const noun = role === 'creator' ? 'creator' : 'reposter'
  const errors: Array<string | undefined> = []
  let sent = 0

  if (templates.length > 0) {
    const head = await sendTelegramMessage(
      `✉️ ${noun.toUpperCase()} MESSAGES · ${dayTitle(report)}\n` +
        `${templates.length} ${noun}${templates.length === 1 ? '' : 's'} behind. Tap the grey box to copy.`,
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
      ? `✉️ No ${noun} messages needed — every ${noun} is done for ${dayTitle(report)}.`
      : `✅ That's all ${templates.length} ${noun} messages.`
  const tail = await sendTelegramMessage(`${footer}\n\n${BUTTON_GUIDE}`, { chatId, replyMarkup: buttons })
  errors.push(tail.error)

  const error = errors.filter(Boolean).join(' · ') || undefined
  return { ok: !error, day: report.day, error, messages: sent }
}
