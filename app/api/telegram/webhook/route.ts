import { NextResponse, after } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { answerCallbackQuery, sendTelegramMessage, telegramWebhookSecret } from '@/lib/telegram'
import { REPORT_BUTTONS, sendAttendanceReports, type ReportMode } from '@/lib/telegram-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Update = {
  message?: { chat?: { id?: number | string }; text?: string }
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } }
}

type Request_ = { mode: ReportMode; withMessages: boolean } | 'help' | null

const HELP =
  'Tap a button or send a command:\n' +
  '/update — today so far (who posted, who still needs to)\n' +
  '/report — yesterday, full day\n' +
  '/messages — today so far + a copy-ready Arabic message for each person who still needs to post\n' +
  '/messages_yesterday — the same for yesterday (full day)\n\n' +
  'Automatic (info only, no messages): 5:00 PM Riyadh (today so far) and 12:00 AM Riyadh (full day).'

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
  const yesterday = words.slice(1).some((w) => w.startsWith('yesterday') || w === 'امس' || w === 'أمس')
  if (['messages', 'message', 'msgs', 'msg', 'templates', 'رسائل'].includes(cmd)) {
    return { mode: yesterday ? 'final' : 'live', withMessages: true }
  }
  if (cmd === 'messages_yesterday' || cmd === 'msgs_yesterday') return { mode: 'final', withMessages: true }
  if (['update', 'now', 'today'].includes(cmd)) return { mode: 'live', withMessages: false }
  if (['report', 'yesterday'].includes(cmd)) return { mode: 'final', withMessages: false }
  if (['start', 'help'].includes(cmd)) return 'help'
  return null
}

function parseButton(data: string | undefined): Request_ {
  if (data === 'report:live') return { mode: 'live', withMessages: false }
  if (data === 'report:final') return { mode: 'final', withMessages: false }
  if (data === 'msgs:live') return { mode: 'live', withMessages: true }
  if (data === 'msgs:final') return { mode: 'final', withMessages: true }
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
        ? request.withMessages
          ? 'Building the messages…'
          : 'Building the report…'
        : undefined,
    )
  } else if (update.message?.text) {
    request = parseText(update.message.text)
  }

  if (request === 'help') {
    await sendTelegramMessage(HELP, { chatId, replyMarkup: REPORT_BUTTONS })
  } else if (request) {
    const { mode, withMessages } = request
    // Answer Telegram now; sending many messages can take a minute and it would retry.
    after(async () => {
      try {
        const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
        const { getOperationalToday } = await import('@/lib/queries')
        await ensureCreatorTrackingColumns()
        const result = await sendAttendanceReports(await getOperationalToday(), mode, {
          chatId,
          withMessages,
        })
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
