import { NextResponse, after } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { answerCallbackQuery, sendTelegramMessage, telegramWebhookSecret } from '@/lib/telegram'
import {
  groupLeaderButtons,
  groupLeaderPrompt,
  parseReportSquad,
  squadRoleButtons,
  squadRolePrompt,
  type ReportSquad,
} from '@/lib/telegram-groups'
import {
  BUTTON_GUIDE,
  reportButtons,
  sendAttendanceReports,
  type ReportMode,
  type ReportRole,
  type ReportView,
} from '@/lib/telegram-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Update = {
  message?: {
    chat?: { id?: number | string }
    text?: string
    reply_to_message?: { text?: string }
  }
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } }
}

type Request_ =
  | { view: ReportView; mode: ReportMode; role?: ReportRole; squad?: ReportSquad }
  | { menu: 'groups' | 'squad'; mode: ReportMode; squad?: ReportSquad }
  | 'help'
  | null

const HELP =
  `${BUTTON_GUIDE}\n` +
  '📋 Type /report for the last full day.\n' +
  '👑 Type /groups to pick Alpha, Beta, Charlie, Delta, or Ungrouped.\n' +
  '↩️ Reply to a report and send /update to refresh that last night (not today).\n\n' +
  'Automatic summary: 5:00 PM Riyadh (today so far) and 12:00 AM Riyadh (the day that just ended).'

function secretMatches(header: string | null): boolean {
  const secret = telegramWebhookSecret()
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

function parseText(text: string): Request_ {
  const words = text.trim().toLowerCase().split(/\s+/)
  const cmd = words[0]?.split('@')[0]?.replace(/^\//, '') ?? ''
  const rest = words.slice(1).join(' ')
  if (['messages_creators', 'msgs_creators'].includes(cmd)) return { view: 'messages', mode: 'live', role: 'creator' }
  if (['messages_reposters', 'msgs_reposters'].includes(cmd)) return { view: 'messages', mode: 'live', role: 'reposter' }
  if (['messages', 'message', 'msgs', 'رسائل'].includes(cmd)) {
    if (/repost|معيد/.test(rest)) return { view: 'messages', mode: 'live', role: 'reposter' }
    if (/creat|صانع|صناع/.test(rest)) return { view: 'messages', mode: 'live', role: 'creator' }
    return 'help'
  }
  if (['list', 'full', 'names'].includes(cmd)) return { view: 'list', mode: 'live' }
  if (['groups', 'leaders', 'groupleader', 'group_leader'].includes(cmd)) {
    return { menu: 'groups', mode: 'live' }
  }
  if (['update', 'now', 'today', 'summary'].includes(cmd)) return { view: 'summary', mode: 'live' }
  if (['report', 'yesterday'].includes(cmd)) return { view: 'summary', mode: 'final' }
  if (['start', 'help'].includes(cmd)) return 'help'
  return null
}

function parseMode(value: string | undefined): ReportMode {
  return value === 'final' ? 'final' : 'live'
}

function parseButton(data: string | undefined): Request_ {
  const [kind, a, b, c] = (data ?? '').split(':')
  if (kind === 'report') return { view: 'summary', mode: parseMode(a) }
  if (kind === 'list') return { view: 'list', mode: parseMode(a) }
  if (kind === 'gl') return { menu: 'groups', mode: parseMode(a) }
  if (kind === 'sq') {
    const squad = parseReportSquad(a)
    if (!squad) return null
    return { menu: 'squad', mode: parseMode(b), squad }
  }
  if (kind === 'squ') {
    const squad = parseReportSquad(a)
    if (!squad) return null
    return { view: 'summary', mode: parseMode(b), squad }
  }
  if (kind === 'sql') {
    const squad = parseReportSquad(a)
    if (!squad) return null
    return { view: 'list', mode: parseMode(b), squad }
  }
  if (kind === 'sqm') {
    const squad = parseReportSquad(a)
    if (!squad || (b !== 'creator' && b !== 'reposter')) return null
    return { view: 'messages', mode: parseMode(c), role: b, squad }
  }
  if (kind === 'msgs' && (a === 'creator' || a === 'reposter')) return { view: 'messages', mode: parseMode(b), role: a }
  if (kind === 'msgs') return 'help'
  return null
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const update = (await req.json().catch(() => ({}))) as Update
  const chatId = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id
  const allowed = process.env.TELEGRAM_CHAT_ID?.trim()
  // Private bot: ignore every chat except ours.
  if (chatId == null || !allowed || String(chatId) !== allowed) {
    return NextResponse.json({ ok: true })
  }

  let request: Request_ = null
  if (update.callback_query) {
    request = parseButton(update.callback_query.data)
    const tapNote =
      request && request !== 'help'
        ? 'menu' in request
          ? request.menu === 'groups'
            ? 'Pick a group…'
            : 'Update, list, or reminders…'
          : request.view === 'messages'
            ? 'Building the messages…'
            : 'Building…'
        : undefined
    await answerCallbackQuery(update.callback_query.id, tapNote)
  } else if (update.message?.text) {
    request = parseText(update.message.text)
    if (
      request &&
      request !== 'help' &&
      !('menu' in request) &&
      request.mode === 'live' &&
      update.message.reply_to_message?.text
    ) {
      request = { ...request, mode: 'final' }
    }
  }

  if (request === 'help') {
    await sendTelegramMessage(HELP, { chatId, replyMarkup: reportButtons('live') })
  } else if (request && 'menu' in request) {
    if (request.menu === 'groups') {
      await sendTelegramMessage(groupLeaderPrompt(), { chatId, replyMarkup: groupLeaderButtons(request.mode) })
    } else if (request.squad) {
      await sendTelegramMessage(squadRolePrompt(request.squad), {
        chatId,
        replyMarkup: squadRoleButtons(request.squad, request.mode),
      })
    }
  } else if (request) {
    const { view, mode, role, squad } = request
    // Answer Telegram now; sending many messages can take a minute and it would retry.
    after(async () => {
      try {
        const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
        const { getOperationalToday } = await import('@/lib/queries')
        await ensureCreatorTrackingColumns()
        const result = await sendAttendanceReports(await getOperationalToday(), mode, { chatId, view, role, squad })
        if (!result.ok && result.error) {
          await sendTelegramMessage(`Could not send everything: ${result.error.slice(0, 500)}`, { chatId })
        }
      } catch (e) {
        await sendTelegramMessage(
          `Could not build the report: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown error'}`,
          { chatId },
        )
      }
    })
  }
  return NextResponse.json({ ok: true })
}
