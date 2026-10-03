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

export type WindowReport = {
  mode: ReportMode
  reportDay: string
  days: string[]
  people: WindowPerson[]
  generatedAt: Date
}

export async function buildWindowReport(opToday: string, mode: ReportMode): Promise<WindowReport> {
  const reportDay = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  const days = Array.from({ length: REPORT_WINDOW_DAYS }, (_, i) =>
    addDays(reportDay, i - (REPORT_WINDOW_DAYS - 1)),
  )
  const rosters = await Promise.all(days.map((d) => getAttendanceForDay(d)))
  const byDay = rosters.map((r) => new Map(r.map((p) => [p.id, p.status])))
  const people = rosters[rosters.length - 1].map((p) => ({
    ...p,
    days: byDay.map((m) => m.get(p.id) ?? null),
  }))
  return { mode, reportDay, days, people, generatedAt: new Date() }
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

function icon(status: AttendanceStatus | null, isLiveToday: boolean): string {
  if (status == null) return '▫️'
  if (status === 'hit') return '✅'
  if (status === 'partial') return '⚠️'
  if (status === 'break') return '🏖'
  return isLiveToday ? '⏳' : '❌'
}

function countsLine(p: AttendancePerson): string {
  const bits: string[] = []
  if (p.goalInstagram > 0) bits.push(`IG ${p.todayInstagram}/${p.goalInstagram}`)
  if (p.goalTiktok > 0) bits.push(`TT ${p.todayTiktok}/${p.goalTiktok}`)
  if (bits.length === 0) bits.push(`IG ${p.todayInstagram}`, `TT ${p.todayTiktok}`)
  return bits.join(' · ')
}

function missingEn(p: AttendancePerson): string {
  const parts: string[] = []
  if (p.goalInstagram > 0 && p.todayInstagram < p.goalInstagram) {
    parts.push(`IG ${p.goalInstagram - p.todayInstagram}`)
  }
  if (p.goalTiktok > 0 && p.todayTiktok < p.goalTiktok) {
    parts.push(`TT ${p.goalTiktok - p.todayTiktok}`)
  }
  return parts.join(' · ')
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

function personLine(p: WindowPerson, report: WindowReport): string {
  const live = report.mode === 'live'
  const icons = p.days.map((s, i) => icon(s, live && i === p.days.length - 1)).join('')
  const last = p.days[p.days.length - 1]
  const missedAll = p.days.every((s) => s === 'miss')
  let detail: string
  if (last === 'break') detail = 'on break'
  else if (last === 'hit') detail = countsLine(p)
  else if (last === 'partial') detail = `${countsLine(p)} (needs ${missingEn(p)})`
  else if (missedAll) {
    detail = live
      ? `missed ${REPORT_WINDOW_DAYS - 1} days · nothing yet today`
      : `no post for ${REPORT_WINDOW_DAYS} days`
  }
  else detail = live ? 'nothing yet today' : 'no post'
  const strikes = p.role === 'reposter' && p.contractId != null ? ` · strikes ${p.contractStrikes}/${p.maxStrikes}` : ''
  return `${icons} ${p.name} — ${detail}${strikes}`
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

/** One English message for one role (info only; templates are sent separately). */
export function formatRoleMessage(report: WindowReport, role: 'reposter' | 'creator'): string {
  const live = report.mode === 'live'
  const people = sortForReport(report.people.filter((p) => p.role === role))
  const title = role === 'reposter' ? 'REPOSTERS' : 'CREATORS'
  const count = (s: AttendanceStatus) => people.filter((p) => p.days[p.days.length - 1] === s).length

  const lines: string[] = [
    live
      ? `🔄 ${title} · Live update · ${enDay(report.reportDay)} so far (${riyadhTime(report.generatedAt)} Riyadh)`
      : `📋 ${title} · Daily report · ${enDay(report.reportDay)} (closed 12:00 AM Riyadh)`,
    `Last ${REPORT_WINDOW_DAYS} days: ${report.days.map((d) => enDay(d, false)).join(' · ')}`,
    `✅ done · ⚠️ partial · ${live ? '⏳ not yet today · ' : ''}❌ no post · 🏖 break · ▫️ not on team yet`,
    '',
    `${enDay(report.reportDay, false)}${live ? ' so far' : ''}: ${people.length} ${role === 'reposter' ? 'reposters' : 'creators'} · ✅ ${count('hit')} · ⚠️ ${count('partial')} · ${live ? '⏳' : '❌'} ${count('miss')} · 🏖 ${count('break')}`,
  ]

  if (people.length === 0) {
    lines.push('', '(nobody)')
    return lines.join('\n')
  }

  const { urgent, pending, fine } = splitBehind(people, report)
  if (urgent.length > 0) {
    lines.push('', live ? `MISSED BEFORE + NOT DONE TODAY (${urgent.length})` : `NEEDS A MESSAGE (${urgent.length})`)
    for (const p of urgent) lines.push(personLine(p, report))
  }
  if (pending.length > 0) {
    lines.push('', `NOT DONE YET TODAY (${pending.length})`)
    for (const p of pending) lines.push(personLine(p, report))
  }
  if (fine.length > 0) {
    lines.push('', urgent.length + pending.length > 0 ? `OK (${fine.length})` : `ALL OK (${fine.length})`)
    for (const p of fine) lines.push(personLine(p, report))
  }
  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** One copy-ready Telegram message per person who needs a nudge (reposters first). */
export function buildMessageTemplates(report: WindowReport, today: string): string[] {
  const behind = (['reposter', 'creator'] as const).flatMap((role) => {
    const { urgent, pending } = splitBehind(
      sortForReport(report.people.filter((p) => p.role === role)),
      report,
    )
    return [...urgent, ...pending]
  })
  return behind.map((p, i) => {
    const role = p.role === 'reposter' ? 'Reposter' : 'Creator'
    const icons = p.days.map((s, j) => icon(s, report.mode === 'live' && j === p.days.length - 1)).join('')
    return (
      `<b>${i + 1}/${behind.length} · ${escapeHtml(p.name)}</b> · ${role} ${icons}\n` +
      `<pre>${escapeHtml(arabicTemplate(p, report, today))}</pre>`
    )
  })
}

export const REPORT_BUTTONS = {
  inline_keyboard: [
    [
      { text: '🔄 Today so far', callback_data: 'report:live' },
      { text: '📋 Yesterday (full day)', callback_data: 'report:final' },
    ],
    [
      { text: '✉️ Messages · today', callback_data: 'msgs:live' },
      { text: '✉️ Messages · yesterday', callback_data: 'msgs:final' },
    ],
  ],
}

const MESSAGES_HINT =
  'Copy-ready messages for each person: send /messages (today) or /messages_yesterday, or tap a button below.'

/**
 * Two info messages: reposters, then creators (with the buttons).
 * `withMessages`: then one Arabic template message per person who needs a nudge.
 */
export async function sendAttendanceReports(
  opToday: string,
  mode: ReportMode,
  opts: { chatId?: string | number; withMessages?: boolean } = {},
): Promise<{ ok: boolean; day: string; error?: string; skipped?: boolean; messages?: number }> {
  const { telegramConfigured, sendTelegramMessage } = await import('@/lib/telegram')
  const reportDay = mode === 'live' ? opToday : lastCompletedOperationalDay(opToday)
  if (!telegramConfigured()) return { ok: true, day: reportDay, skipped: true }
  const { chatId, withMessages = false } = opts

  const report = await buildWindowReport(opToday, mode)
  const reposters = await sendTelegramMessage(formatRoleMessage(report, 'reposter'), { chatId })
  const creators = await sendTelegramMessage(
    withMessages ? formatRoleMessage(report, 'creator') : `${formatRoleMessage(report, 'creator')}\n\n${MESSAGES_HINT}`,
    { chatId, replyMarkup: REPORT_BUTTONS },
  )
  const errors = [reposters.error, creators.error]
  let sent = 0

  if (withMessages) {
    const templates = buildMessageTemplates(report, opToday)
    const reposterCount = report.people.filter((p) => p.role === 'reposter' && needsMessage(p)).length
    const header =
      templates.length === 0
        ? `✉️ No messages needed — everyone is done for ${enDay(report.reportDay)}${mode === 'live' ? ' so far' : ''}.`
        : `✉️ MESSAGES TO SEND · ${enDay(report.reportDay)}${mode === 'live' ? ' so far' : ' (full day)'}\n` +
          `${templates.length} people (${reposterCount} reposters, ${templates.length - reposterCount} creators).\n` +
          'Each one is its own message — tap the grey box to copy it.'
    const head = await sendTelegramMessage(header, { chatId })
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

  const error = errors.filter(Boolean).join(' · ') || undefined
  return { ok: !error, day: report.reportDay, error, messages: withMessages ? sent : undefined }
}
