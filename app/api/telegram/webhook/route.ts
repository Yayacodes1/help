import { NextResponse, after } from 'next/server'
import { timingSafeEqual } from 'crypto'
import {
  answerCallbackQuery,
  isTelegramAllowedChat,
  sendTelegramMessage,
  telegramWebhookSecret,
} from '@/lib/telegram'
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
  sendAttendanceReports,
  sendBehindPersonMessage,
  updateMenuButtons,
  updateMenuPrompt,
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
  }
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } }
}

type ReportRequest = {
  view: ReportView
  mode: ReportMode
  role?: ReportRole
  squad?: ReportSquad
  flavor?: 'default' | 'today' | 'progress'
}

type Request_ =
  | ReportRequest
  | { menu: 'groups' | 'squad' | 'update'; mode: ReportMode; squad?: ReportSquad }
  | {
      messagePick: 'page' | 'one' | 'all'
      role: ReportRole
      mode: ReportMode
      page?: number
      creatorId?: number
      squad?: ReportSquad
    }
  | 'help'
  | null

const HELP =
  `${BUTTON_GUIDE}\n\n` +
  'Automatic: 5:00 PM Riyadh (so far) and 12:00 AM Riyadh (previous day).'

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
  if (['messages_creators', 'msgs_creators', 'messages', 'message', 'msgs', 'رسائل'].includes(cmd)) {
    return { view: 'messages', mode: 'live', role: 'creator' }
  }
  if (['messages_reposters', 'msgs_reposters'].includes(cmd)) {
    // Reposters removed from the bot — creators only.
    return 'help'
  }
  if (['list', 'full', 'names'].includes(cmd)) return { view: 'list', mode: 'live' }
  if (['groups', 'leaders', 'groupleader', 'group_leader'].includes(cmd)) {
    return { menu: 'groups', mode: 'live' }
  }
  if (['yesterday', 'report', 'prev', 'previous'].includes(cmd)) {
    return { view: 'summary', mode: 'final' }
  }
  // /today is the same as so-far now — no separate "today" report.
  if (['today', 'day', 'now', 'sofar', 'so_far', 'progress'].includes(cmd)) {
    return { view: 'progress', mode: 'live', flavor: 'progress' }
  }
  if (['update', 'summary'].includes(cmd)) {
    if (/yester|prev|previous|أمس|امس/.test(rest)) return { view: 'summary', mode: 'final' }
    // Default: so far today — how many creators posted to this point.
    return { view: 'progress', mode: 'live', flavor: 'progress' }
  }
  // Removed from the bot — still answer so the chat doesn't look dead.
  if (
    ['streaks', 'pstreaks', 'creator_streaks', 'probation', 'fitness', 'consistency', 'checkin', 'التزام', 'welcome', 'onboard', 'newcreator', 'ترحيب'].includes(
      cmd,
    )
  ) {
    return 'help'
  }
  if (['start', 'help'].includes(cmd)) return 'help'
  // Any other /command → help. Plain text stays ignored (group noise).
  if (text.trim().startsWith('/')) return 'help'
  return null
}

function parseMode(value: string | undefined): ReportMode {
  return value === 'final' ? 'final' : 'live'
}

function parseButton(data: string | undefined): Request_ {
  const [kind, a, b, c] = (data ?? '').split(':')
  if (kind === 'upd') {
    if (a === 'prev') return { view: 'summary', mode: 'final' }
    // Old "Today" buttons → so far (same live day).
    if (a === 'today' || a === 'sofar') return { view: 'progress', mode: 'live', flavor: 'progress' }
    return { menu: 'update', mode: 'live' }
  }
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
    if (!squad) return null
    if (b === 'reposter') return 'help'
    if (b !== 'creator') return null
    return { view: 'messages', mode: parseMode(c), role: 'creator', squad }
  }
  if (kind === 'msgs' && a === 'creator') {
    return { view: 'messages', mode: parseMode(b), role: 'creator' }
  }
  if (kind === 'msgs' && a === 'reposter') return 'help'
  if (kind === 'msgs') return 'help'
  if ((kind === 'msg' || kind === 'msgpage' || kind === 'msgall') && a === 'reposter') {
    return 'help'
  }
  if ((kind === 'msg' || kind === 'msgpage' || kind === 'msgall') && a === 'creator') {
    const mode = parseMode(b)
    const parts = (data ?? '').split(':')
    const squadTok = kind === 'msgall' ? parts[3] : parts[4]
    const squad =
      !squadTok || squadTok === '_' ? undefined : parseReportSquad(squadTok) ?? undefined
    if (kind === 'msgall') {
      return { messagePick: 'all', role: 'creator', mode, squad }
    }
    if (kind === 'msgpage') {
      const pageNum = Math.max(0, Number(parts[3]) || 0)
      return { messagePick: 'page', role: 'creator', mode, page: pageNum, squad }
    }
    const creatorId = Number(parts[3])
    if (!Number.isFinite(creatorId) || creatorId <= 0) return null
    return { messagePick: 'one', role: 'creator', mode, creatorId, squad }
  }
  // Old keyboards (streaks / fitness / welcome) — send help instead of silence.
  if (
    kind === 'pstreaks' ||
    kind === 'pstreak' ||
    kind === 'fit' ||
    kind === 'welcome' ||
    kind === 'fitpage' ||
    kind === 'welcomepage'
  ) {
    return 'help'
  }
  return null
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const update = (await req.json().catch(() => ({}))) as Update
  const chatId = update.callback_query?.message?.chat?.id ?? update.message?.chat?.id
  // Private bot: ignore every chat except the configured team chat(s).
  if (!isTelegramAllowedChat(chatId)) {
    // If Telegram reached us but this isn't the team chat, say so — otherwise it looks broken.
    const text = update.message?.text?.trim() ?? ''
    if (chatId != null && /^\/(update|help|start|now|today|yesterday|list)(@\w+)?\b/i.test(text)) {
      await sendTelegramMessage(
        'This bot only answers in the configured team chat. Open that group and send /update there.',
        { chatId },
      )
    }
    return NextResponse.json({ ok: true })
  }

  let request: Request_ = null
  if (update.callback_query) {
    request = parseButton(update.callback_query.data)
    const tapNote =
      request && request !== 'help'
        ? 'messagePick' in request
          ? request.messagePick === 'one'
            ? 'Copy message…'
            : request.messagePick === 'all'
              ? 'Sending all…'
              : 'Loading list…'
          : 'menu' in request
            ? request.menu === 'groups'
              ? 'Pick a group…'
              : request.menu === 'update'
                ? 'Pick an update…'
                : 'Update, list, or reminders…'
            : request.view === 'messages'
              ? 'Loading who is behind…'
              : 'Building…'
        : undefined
    await answerCallbackQuery(update.callback_query.id, tapNote)
  } else if (update.message?.text) {
    request = parseText(update.message.text)
  }

  // Unknown button on an old message → don't leave the chat hanging.
  if (update.callback_query && request == null) {
    await sendTelegramMessage('That button is outdated. Type /update', {
      chatId,
      replyMarkup: updateMenuButtons(),
    })
    return NextResponse.json({ ok: true })
  }

  if (request === 'help') {
    await sendTelegramMessage(HELP, { chatId, replyMarkup: updateMenuButtons() })
  } else if (request && 'messagePick' in request) {
    const pick = request
    after(async () => {
      try {
        const { getOperationalToday } = await import('@/lib/queries')
        const opToday = await getOperationalToday()
        if (pick.messagePick === 'one' && pick.creatorId) {
          const res = await sendBehindPersonMessage(
            opToday,
            pick.mode,
            pick.role,
            pick.creatorId,
            chatId,
            pick.squad,
          )
          if (!res.ok && res.error) {
            await sendTelegramMessage(`Could not build message: ${res.error.slice(0, 300)}`, {
              chatId,
            })
          }
          return
        }
        const result = await sendAttendanceReports(opToday, pick.mode, {
          chatId,
          view: 'messages',
          role: pick.role,
          squad: pick.squad,
          dumpAll: pick.messagePick === 'all',
          page: pick.page ?? 0,
        })
        if (!result.ok && result.error) {
          await sendTelegramMessage(`Could not send everything: ${result.error.slice(0, 500)}`, {
            chatId,
          })
        }
      } catch (e) {
        await sendTelegramMessage(
          `Could not build messages: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown error'}`,
          { chatId },
        )
      }
    })
  } else if (request && 'menu' in request) {
    if (request.menu === 'update') {
      await sendTelegramMessage(updateMenuPrompt(), { chatId, replyMarkup: updateMenuButtons() })
    } else if (request.menu === 'groups') {
      await sendTelegramMessage(groupLeaderPrompt(), {
        chatId,
        replyMarkup: groupLeaderButtons(request.mode),
      })
    } else if (request.squad) {
      await sendTelegramMessage(squadRolePrompt(request.squad), {
        chatId,
        replyMarkup: squadRoleButtons(request.squad, request.mode),
      })
    }
  } else if (request) {
    const { view, mode, role, squad, flavor } = request
    if (!update.callback_query) {
      const ack =
        view === 'messages'
          ? '✉️ Loading who is behind (creators)…'
          : view === 'list'
            ? '📋 Building the creator list…'
            : mode === 'final'
              ? '📅 Building previous day…'
              : '⏱ Building so-far today…'
      await sendTelegramMessage(ack, { chatId })
    }
    // Answer Telegram now; sending many messages can take a minute and it would retry.
    after(async () => {
      try {
        const { getOperationalToday } = await import('@/lib/queries')
        const result = await sendAttendanceReports(await getOperationalToday(), mode, {
          chatId,
          view,
          role,
          squad,
          flavor,
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
