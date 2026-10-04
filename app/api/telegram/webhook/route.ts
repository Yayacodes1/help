import { NextResponse, after } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { answerCallbackQuery, sendTelegramMessage, telegramWebhookSecret } from '@/lib/telegram'
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
  message?: { chat?: { id?: number | string }; text?: string }
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } }
}

type Request_ = { view: ReportView; mode: ReportMode; role?: ReportRole } | 'help' | null

const HELP =
  `${BUTTON_GUIDE}\n` +
  '📋 Type /report for the last full day.\n\n' +
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
  if (['update', 'now', 'today', 'summary'].includes(cmd)) return { view: 'summary', mode: 'live' }
  if (['report', 'yesterday'].includes(cmd)) return { view: 'summary', mode: 'final' }
  if (['start', 'help'].includes(cmd)) return 'help'
  return null
}

function parseMode(value: string | undefined): ReportMode {
  return value === 'final' ? 'final' : 'live'
}

function parseButton(data: string | undefined): Request_ {
  const [kind, a, b] = (data ?? '').split(':')
  if (kind === 'report') return { view: 'summary', mode: parseMode(a) }
  if (kind === 'list') return { view: 'list', mode: parseMode(a) }
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
    await answerCallbackQuery(
      update.callback_query.id,
      request && request !== 'help'
        ? request.view === 'messages'
          ? 'Building the messages…'
          : 'Building…'
        : undefined,
    )
  } else if (update.message?.text) {
    request = parseText(update.message.text)
  }

  if (request === 'help') {
    await sendTelegramMessage(HELP, { chatId, replyMarkup: reportButtons('live') })
  } else if (request) {
    const { view, mode, role } = request
    // Answer Telegram now; sending many messages can take a minute and it would retry.
    after(async () => {
      try {
        const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
        const { getOperationalToday } = await import('@/lib/queries')
        await ensureCreatorTrackingColumns()
        const result = await sendAttendanceReports(await getOperationalToday(), mode, { chatId, view, role })
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
