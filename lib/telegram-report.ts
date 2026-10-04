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

export const REPORT_WINDOW_DAYS = 3

type WindowPerson = AttendancePerson & {
  /** Status per window day, oldest → newest. `null` = not on the team that day. */
  days: Array<AttendanceStatus | null>
}

/** Per project: posted anything for that project that day. `null` = not on the team yet. */
type ProjectDay = 'posted' | 'none' | 'break' | null

type ProjectPerson = Pick<
  AttendancePerson,
  'id' | 'name' | 'role' | 'contractId' | 'contractStrikes' | 'maxStrikes'
> & { days: ProjectDay[] }

type ProjectSection = { id: number; name: string; people: ProjectPerson[] }

export type WindowReport = {
  mode: ReportMode
  reportDay: string
  days: string[]
  /** Everyone, all projects combined (drives the copy-ready messages). */
  people: WindowPerson[]
  /** Who posted for each project (drives the info messages). */
  projects: ProjectSection[]
  generatedAt: Date
}

async function buildProjectSection(
  project: { id: number; name: string },
  reportDay: string,
  days: string[],
): Promise<ProjectSection> {
  const { getCreatorsWithProgressOnDate } = await import('@/lib/queries')
  const [members, ...rosters] = await Promise.all([
    getCreatorsWithProgressOnDate(reportDay, project.id, null, { projectMembersOnly: true }),
    ...days.map((d) => getAttendanceForDay(d, project.id)),
  ])
  const memberIds = new Set(members.map((m) => m.id))
  const byDay = rosters.map(
    (r) =>
      new Map(
        r.map((p): [number, ProjectDay] => [
          p.id,
          p.status === 'break' ? 'break' : p.todayInstagram + p.todayTiktok > 0 ? 'posted' : 'none',
        ]),
      ),
  )
  const people = rosters[rosters.length - 1]
    .filter((p) => memberIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      contractId: p.contractId,
      contractStrikes: p.contractStrikes,
      maxStrikes: p.maxStrikes,
      days: byDay.map((m) => m.get(p.id) ?? null),
    }))
  return { id: project.id, name: project.name, people }
}

export async function buildWindowReport(opToday: string, mode: ReportMode): Promise<WindowReport> {
  const { getAllProjects } = await import('@/lib/queries')
  const reportDay = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  const days = Array.from({ length: REPORT_WINDOW_DAYS }, (_, i) =>
    addDays(reportDay, i - (REPORT_WINDOW_DAYS - 1)),
  )
  const [rosters, projects] = await Promise.all([
    Promise.all(days.map((d) => getAttendanceForDay(d))),
    getAllProjects().then((list) => Promise.all(list.map((p) => buildProjectSection(p, reportDay, days)))),
  ])
  const byDay = rosters.map((r) => new Map(r.map((p) => [p.id, p.status])))
  const people = rosters[rosters.length - 1].map((p) => ({
    ...p,
    days: byDay.map((m) => m.get(p.id) ?? null),
  }))
  return { mode, reportDay, days, people, projects, generatedAt: new Date() }
}

function enDay(ymd: string, withWeekday = true): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    ...(withWeekday ? { weekday: 'short' as const } : {}),
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
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

function arJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join('، ')} و${items[items.length - 1]}`
}

function dayIcon(status: ProjectDay): string {
  if (status == null) return '–'
  if (status === 'posted') return '✅'
  if (status === 'break') return '🏖'
  return '❌'
}

/** "Sat Oct 3 ✅ · Fri Oct 2 ❌ · Thu Oct 1 ✅" (newest first). */
function daysLine(statuses: ProjectDay[], days: string[]): string {
  return days
    .map((d, i) => `${enDay(d)} ${dayIcon(statuses[i])}`)
    .reverse()
    .join(' · ')
}

function overallDay(status: AttendanceStatus | null): ProjectDay {
  if (status == null) return null
  if (status === 'break') return 'break'
  return status === 'miss' ? 'none' : 'posted'
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

/** The last day still needs a nudge (not done, not on break). */
function needsMessage(p: WindowPerson): boolean {
  const last = p.days[p.days.length - 1]
  return last === 'miss' || last === 'partial'
}

/** Days in the window (before the last one) with no post at all. */
function earlierMisses(p: WindowPerson, days: string[]): string[] {
  return days.slice(0, -1).filter((_, i) => p.days[i] === 'miss')
}

function arabicTemplate(p: WindowPerson, report: WindowReport, today: string): string {
  const live = report.mode === 'live'
  const last = p.days[p.days.length - 1]
  const missedBefore = earlierMisses(p, report.days).map(arDay)
  const lastLabel = arDay(report.reportDay)
  const deadline = 'قبل الساعة 12 منتصف الليل بتوقيت السعودية'
  const lines: string[] = []

  if (live) {
    if (last === 'miss') {
      lines.push(
        missedBefore.length > 0
          ? `مرحباً ${p.name}، لاحظنا أنك لم تنشر يوم ${arJoin(missedBefore)}، ولم تنشر اليوم بعد.`
          : `مرحباً ${p.name}، تذكير لطيف: لم تنشر اليوم (${lastLabel}) بعد.`,
      )
      lines.push(`يرجى النشر اليوم ${deadline}.`)
    } else {
      lines.push(`مرحباً ${p.name}، ما زال ينقصك اليوم: ${missingAr(p)}.`)
      if (missedBefore.length > 0) lines.push(`وأيضاً لم تنشر يوم ${arJoin(missedBefore)}.`)
      lines.push(`يرجى الإكمال ${deadline}.`)
    }
  } else {
    const todayLabel = arDay(today)
    if (last === 'miss') {
      const missed = [...missedBefore, lastLabel]
      lines.push(`مرحباً ${p.name}، لاحظنا أنك لم تنشر يوم ${arJoin(missed)}.`)
    } else {
      lines.push(`مرحباً ${p.name}، لم تكتمل منشورات يوم ${lastLabel} — كان ينقصك: ${missingAr(p)}.`)
      if (missedBefore.length > 0) lines.push(`وأيضاً لم تنشر يوم ${arJoin(missedBefore)}.`)
    }
    lines.push(`يرجى النشر اليوم (${todayLabel}) ${deadline}.`)
    if (p.role === 'reposter' && last === 'miss' && p.contractId != null) {
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

const STATUS_ORDER: Record<string, number> = { miss: 0, partial: 1, hit: 2, break: 3 }

function sortForReport(people: WindowPerson[]): WindowPerson[] {
  return [...people].sort((a, b) => {
    const sa = STATUS_ORDER[a.days[a.days.length - 1] ?? 'hit'] ?? 2
    const sb = STATUS_ORDER[b.days[b.days.length - 1] ?? 'hit'] ?? 2
    return sa - sb || a.name.localeCompare(b.name)
  })
}

/** Live: people who already missed an earlier day come first; the rest just haven't posted yet. */
function splitBehind(people: WindowPerson[], report: WindowReport) {
  const live = report.mode === 'live'
  const needing = people.filter(needsMessage)
  const urgent = live ? needing.filter((p) => earlierMisses(p, report.days).length > 0) : needing
  const pending = live ? needing.filter((p) => earlierMisses(p, report.days).length === 0) : []
  return { urgent, pending, fine: people.filter((p) => !needsMessage(p)) }
}

function projectPersonLine(p: ProjectPerson, days: string[]): string {
  const strikes =
    p.role === 'reposter' && p.contractId != null ? ` · strikes ${p.contractStrikes}/${p.maxStrikes}` : ''
  return `${p.name} — ${daysLine(p.days, days)}${strikes}`
}

/** One English message for one role: a section per project with who posted and who didn't. */
export function formatRoleMessage(report: WindowReport, role: 'reposter' | 'creator'): string {
  const live = report.mode === 'live'
  const title = role === 'reposter' ? 'REPOSTERS' : 'CREATORS'
  const day = enDay(report.reportDay)
  const lines: string[] = [
    live
      ? `${role === 'creator' ? '🎬' : '🔁'} ${title} · ${day} so far (${riyadhTime(report.generatedAt)} Riyadh)`
      : `${role === 'creator' ? '🎬' : '🔁'} ${title} · ${day} (full day)`,
  ]

  for (const project of report.projects) {
    const people = project.people
      .filter((p) => (role === 'reposter' ? p.role === 'reposter' : p.role !== 'reposter'))
      .sort((a, b) => a.name.localeCompare(b.name))
    const last = (p: ProjectPerson) => p.days[p.days.length - 1]
    const missed = people.filter((p) => last(p) === 'none')
    const posted = people.filter((p) => last(p) === 'posted')
    const away = people.filter((p) => last(p) === 'break')

    lines.push('', `━━ ${project.name.toUpperCase()} · ${posted.length}/${people.length - away.length} posted ━━`)
    if (people.length === 0) {
      lines.push('(nobody)')
      continue
    }
    if (missed.length > 0) {
      lines.push(live ? `Not posted yet today (${missed.length})` : `Didn't post (${missed.length})`)
      for (const p of missed) lines.push(projectPersonLine(p, report.days))
    }
    if (posted.length > 0) {
      if (missed.length > 0) lines.push('')
      lines.push(`Posted (${posted.length})`)
      for (const p of posted) lines.push(projectPersonLine(p, report.days))
    }
    if (away.length > 0) {
      lines.push('', `On break (${away.length})`)
      for (const p of away) lines.push(projectPersonLine(p, report.days))
    }
  }
  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** One copy-ready Telegram message per person who needs a nudge (creators first). */
export function buildMessageTemplates(report: WindowReport, today: string): string[] {
  const behind = (['creator', 'reposter'] as const).flatMap((role) => {
    const { urgent, pending } = splitBehind(
      sortForReport(report.people.filter((p) => p.role === role)),
      report,
    )
    return [...urgent, ...pending]
  })
  return behind.map((p, i) => {
    const role = p.role === 'reposter' ? 'Reposter' : 'Creator'
    return (
      `<b>${i + 1}/${behind.length} · ${escapeHtml(p.name)}</b> · ${role}\n` +
      `${daysLine(p.days.map(overallDay), report.days)}\n` +
      `<pre>${escapeHtml(arabicTemplate(p, report, today))}</pre>`
    )
  })
}

export const REPORT_BUTTONS = {
  inline_keyboard: [
    [
      { text: '📊 Today', callback_data: 'report:live' },
      { text: '📋 Yesterday', callback_data: 'report:final' },
      { text: '✉️ Messages', callback_data: 'msgs:live' },
    ],
  ],
}

export const BUTTON_GUIDE =
  'WHAT YOU CAN DO\n' +
  '📊 Today — today so far: who posted and who didn\'t, for each project (last 3 days). Or type /update\n' +
  '📋 Yesterday — the full report for yesterday (last 3 days). Or type /report\n' +
  '✉️ Messages — only the copy-ready Arabic messages, one per person still behind today. Or type /messages'

/**
 * Default: two info messages, creators then reposters (guide + buttons on the last one).
 * `messagesOnly`: skip the info; send one Arabic template per person who needs a nudge, then the guide.
 */
export async function sendAttendanceReports(
  opToday: string,
  mode: ReportMode,
  opts: { chatId?: string | number; messagesOnly?: boolean } = {},
): Promise<{ ok: boolean; day: string; error?: string; skipped?: boolean; messages?: number }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  const reportDay = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  if (!telegramConfigured()) return { ok: true, day: reportDay, skipped: true }
  const { chatId, messagesOnly = false } = opts

  const report = await buildWindowReport(opToday, mode)

  if (!messagesOnly) {
    const creators = await sendTelegramMessage(formatRoleMessage(report, 'creator'), { chatId })
    const reposters = await sendTelegramMessage(`${formatRoleMessage(report, 'reposter')}\n\n${BUTTON_GUIDE}`, {
      chatId,
      replyMarkup: REPORT_BUTTONS,
    })
    const error = [creators.error, reposters.error].filter(Boolean).join(' · ') || undefined
    return { ok: !error, day: report.reportDay, error }
  }

  const templates = buildMessageTemplates(report, opToday)
  const dayLabel = `${enDay(report.reportDay)}${mode === 'live' ? ' so far' : ' (full day)'}`
  const errors: Array<string | undefined> = []
  let sent = 0

  if (templates.length > 0) {
    const reposterCount = report.people.filter((p) => p.role === 'reposter' && needsMessage(p)).length
    const head = await sendTelegramMessage(
      `✉️ MESSAGES · ${dayLabel}\n` +
        `${templates.length} people (${templates.length - reposterCount} creators, ${reposterCount} reposters). ` +
        'Tap the grey box to copy.',
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
      ? `✉️ No messages needed — everyone is done for ${dayLabel}.\n\n${BUTTON_GUIDE}`
      : `✅ That's all ${templates.length} messages.\n\n${BUTTON_GUIDE}`
  const tail = await sendTelegramMessage(footer, { chatId, replyMarkup: REPORT_BUTTONS })
  errors.push(tail.error)

  const error = errors.filter(Boolean).join(' · ') || undefined
  return { ok: !error, day: report.reportDay, error, messages: sent }
}
