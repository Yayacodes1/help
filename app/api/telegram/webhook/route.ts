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

type CreatorNoteKind = 'fit' | 'welcome'

type Request_ =
  | ReportRequest
  | { menu: 'groups' | 'squad' | 'update'; mode: ReportMode; squad?: ReportSquad }
  | { probation: 'list' }
  | { probation: 'send'; noticeId: number }
  | { note: 'pick'; kind: CreatorNoteKind; page?: number; query?: string }
  | { note: 'send'; kind: CreatorNoteKind; creatorId: number }
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
  `${BUTTON_GUIDE}\n` +
  '📊 Type /update to pick Previous day, Today, or So far today.\n' +
  '📅 /yesterday — previous day · /today — the day we\'re in · /now — so far today.\n' +
  '⚠️ /streaks — miss queue from Nov 7: 1st verbal → 2nd verbal → final (tap = copy + mark sent).\n' +
  '📈 /fitness — pick a creator (or /fitness Sara) for a consistency check-in to copy.\n' +
  '👋 /welcome — pick a creator (or /welcome Sara) for the new-creator intro to copy.\n' +
  '👑 Type /groups to pick Alpha, Beta, Charlie, Delta, or Ungrouped.\n\n' +
  'Automatic summary: 5:00 PM Riyadh (so far today) and 12:00 AM Riyadh (previous day final).'

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
  if (['messages_creators', 'msgs_creators'].includes(cmd)) {
    return { view: 'messages', mode: 'live', role: 'creator' }
  }
  if (['messages_reposters', 'msgs_reposters'].includes(cmd)) {
    return { view: 'messages', mode: 'live', role: 'reposter' }
  }
  if (['messages', 'message', 'msgs', 'رسائل'].includes(cmd)) {
    if (/repost|معيد/.test(rest)) return { view: 'messages', mode: 'live', role: 'reposter' }
    if (/creat|صانع|صناع/.test(rest)) return { view: 'messages', mode: 'live', role: 'creator' }
    return 'help'
  }
  if (['list', 'full', 'names'].includes(cmd)) return { view: 'list', mode: 'live' }
  if (['groups', 'leaders', 'groupleader', 'group_leader'].includes(cmd)) {
    return { menu: 'groups', mode: 'live' }
  }
  if (['yesterday', 'report', 'prev', 'previous'].includes(cmd)) {
    return { view: 'summary', mode: 'final' }
  }
  if (['today', 'day'].includes(cmd)) {
    return { view: 'summary', mode: 'live', flavor: 'today' }
  }
  if (['now', 'sofar', 'so_far', 'progress'].includes(cmd)) {
    return { view: 'progress', mode: 'live', flavor: 'progress' }
  }
  if (['update', 'summary'].includes(cmd)) {
    if (/yester|prev|previous|أمس|امس/.test(rest)) return { view: 'summary', mode: 'final' }
    if (/so\s*far|now|progress|حتى|الآن|الان/.test(rest)) {
      return { view: 'progress', mode: 'live', flavor: 'progress' }
    }
    if (/today|اليوم/.test(rest)) return { view: 'summary', mode: 'live', flavor: 'today' }
    return { menu: 'update', mode: 'live' }
  }
  if (['streaks', 'pstreaks', 'creator_streaks', 'probation'].includes(cmd)) {
    return { probation: 'list' }
  }
  if (['fitness', 'consistency', 'checkin', 'التزام'].includes(cmd)) {
    return { note: 'pick', kind: 'fit', page: 0, query: rest || undefined }
  }
  if (['welcome', 'onboard', 'newcreator', 'ترحيب'].includes(cmd)) {
    return { note: 'pick', kind: 'welcome', page: 0, query: rest || undefined }
  }
  if (['start', 'help'].includes(cmd)) return 'help'
  return null
}

function parseMode(value: string | undefined): ReportMode {
  return value === 'final' ? 'final' : 'live'
}

function parseButton(data: string | undefined): Request_ {
  const [kind, a, b, c] = (data ?? '').split(':')
  if (kind === 'upd') {
    if (a === 'prev') return { view: 'summary', mode: 'final' }
    if (a === 'today') return { view: 'summary', mode: 'live', flavor: 'today' }
    if (a === 'sofar') return { view: 'progress', mode: 'live', flavor: 'progress' }
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
    if (!squad || (b !== 'creator' && b !== 'reposter')) return null
    return { view: 'messages', mode: parseMode(c), role: b, squad }
  }
  if (kind === 'msgs' && (a === 'creator' || a === 'reposter')) {
    return { view: 'messages', mode: parseMode(b), role: a }
  }
  if (kind === 'msgs') return 'help'
  if ((kind === 'msg' || kind === 'msgpage' || kind === 'msgall') && (a === 'creator' || a === 'reposter')) {
    const mode = parseMode(b)
    const parts = (data ?? '').split(':')
    const squadTok = kind === 'msgall' ? parts[3] : parts[4]
    const squad =
      !squadTok || squadTok === '_' ? undefined : parseReportSquad(squadTok) ?? undefined
    if (kind === 'msgall') {
      return { messagePick: 'all', role: a, mode, squad }
    }
    if (kind === 'msgpage') {
      const pageNum = Math.max(0, Number(parts[3]) || 0)
      return { messagePick: 'page', role: a, mode, page: pageNum, squad }
    }
    const creatorId = Number(parts[3])
    if (!Number.isFinite(creatorId) || creatorId <= 0) return null
    return { messagePick: 'one', role: a, mode, creatorId, squad }
  }
  if (kind === 'pstreaks') return { probation: 'list' }
  if (kind === 'pstreak') {
    const noticeId = Number(a)
    if (Number.isFinite(noticeId) && noticeId > 0) return { probation: 'send', noticeId }
  }
  if (kind === 'fit' || kind === 'welcome') {
    const creatorId = Number(a)
    if (Number.isFinite(creatorId) && creatorId > 0) {
      return { note: 'send', kind, creatorId }
    }
  }
  if (kind === 'fitpage' || kind === 'welcomepage') {
    const page = Math.max(0, Number(a) || 0)
    return { note: 'pick', kind: kind === 'fitpage' ? 'fit' : 'welcome', page }
  }
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
        ? 'messagePick' in request
          ? request.messagePick === 'one'
            ? 'Copy message…'
            : request.messagePick === 'all'
              ? 'Sending all…'
              : 'Loading list…'
          : 'probation' in request
            ? request.probation === 'list'
              ? 'Loading streaks…'
              : 'Building streak message…'
            : 'note' in request
              ? request.note === 'pick'
                ? 'Loading creators…'
                : 'Building message…'
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

  if (request === 'help') {
    await sendTelegramMessage(HELP, { chatId, replyMarkup: updateMenuButtons() })
  } else if (request && 'note' in request) {
    const noteReq = request
    // Text commands need an instant ack — otherwise the group looks broken.
    if (!update.callback_query) {
      await sendTelegramMessage(
        noteReq.note === 'pick'
          ? noteReq.kind === 'fit'
            ? '📈 Loading consistency…'
            : '👋 Loading welcome…'
          : 'Building message…',
        { chatId },
      )
    }
    after(async () => {
      try {
        const {
          listCreatorsForTelegramNotes,
          creatorNotesPickerButtons,
          consistencyPickerPrompt,
          welcomePickerPrompt,
          buildConsistencyNoteForCreator,
          buildWelcomeNoteForCreator,
        } = await import('@/lib/telegram-creator-notes')
        const query = noteReq.note === 'pick' ? noteReq.query : undefined
        const people = await listCreatorsForTelegramNotes(query)

        if (noteReq.note === 'pick') {
          const page = noteReq.page ?? 0
          if (people.length === 0) {
            await sendTelegramMessage(
              query
                ? `No creators matching “${query}”. Try another name, or /fitness with no name for the full list.`
                : 'No active creators found.',
              { chatId },
            )
            return
          }
          // Exact / single match → send the message immediately (no extra tap).
          if (query && people.length === 1) {
            const only = people[0]!
            const body =
              noteReq.kind === 'fit'
                ? await buildConsistencyNoteForCreator(only.id)
                : await buildWelcomeNoteForCreator(only.id)
            if (body) {
              const title =
                noteReq.kind === 'fit' ? 'Consistency check-in' : 'New creator intro'
              await sendTelegramMessage(
                `<b>${title} · ${escapeHtml(only.name)}</b>\n\n<pre>${escapeHtml(body)}</pre>\n\n<i>Copy the message above, then send it to them.</i>`,
                {
                  chatId,
                  parseMode: 'HTML',
                  replyMarkup: creatorNotesPickerButtons(people, noteReq.kind, 0),
                },
              )
              return
            }
          }
          const prompt =
            noteReq.kind === 'fit'
              ? consistencyPickerPrompt(people.length, query)
              : welcomePickerPrompt(people.length, query)
          await sendTelegramMessage(prompt, {
            chatId,
            replyMarkup: creatorNotesPickerButtons(people, noteReq.kind, page),
          })
          return
        }

        const body =
          noteReq.kind === 'fit'
            ? await buildConsistencyNoteForCreator(noteReq.creatorId)
            : await buildWelcomeNoteForCreator(noteReq.creatorId)
        if (!body) {
          await sendTelegramMessage('Creator not found.', {
            chatId,
            replyMarkup: creatorNotesPickerButtons(people, noteReq.kind, 0),
          })
          return
        }
        const title = noteReq.kind === 'fit' ? 'Consistency check-in' : 'New creator intro'
        await sendTelegramMessage(
          `<b>${title}</b>\n\n<pre>${escapeHtml(body)}</pre>\n\n<i>Copy the message above, then send it to them.</i>`,
          {
            chatId,
            parseMode: 'HTML',
            replyMarkup: creatorNotesPickerButtons(people, noteReq.kind, 0),
          },
        )
      } catch (e) {
        await sendTelegramMessage(
          `Could not build creator note: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown error'}`,
          { chatId },
        )
      }
    })
  } else if (request && 'probation' in request) {
    const probationReq = request
    if (!update.callback_query) {
      await sendTelegramMessage(
        probationReq.probation === 'list' ? '⚠️ Loading streaks…' : 'Building streak message…',
        { chatId },
      )
    }
    after(async () => {
      try {
        const { getOperationalToday, getServerToday } = await import('@/lib/queries')
        const {
          listPendingProbationNotices,
          probationStreakButtons,
          probationStreakListText,
          getProbationNoticeById,
          buildProbationStreakMessage,
          markProbationNoticeMessaged,
        } = await import('@/lib/probation')
        const { reportButtons } = await import('@/lib/telegram-report')
        // Don't run syncProbationMisses here — it loops every creator with many SQL
        // round-trips and made /streaks feel stuck. Cron + admin page keep the queue fresh.
        const opToday = await getOperationalToday()

        if (probationReq.probation === 'list') {
          const notices = await listPendingProbationNotices()
          await sendTelegramMessage(probationStreakListText(notices, opToday), {
            chatId,
            replyMarkup:
              notices.length > 0 ? probationStreakButtons(notices) : reportButtons('live'),
          })
          return
        }

        const notice = await getProbationNoticeById(probationReq.noticeId)
        if (!notice || notice.messagedAt) {
          const notices = await listPendingProbationNotices()
          await sendTelegramMessage(
            notice?.messagedAt
              ? `Already sent for ${notice.name} (streak ${notice.level}). They stay off this list until the next streak.`
              : 'That streak notice was not found.',
            {
              chatId,
              replyMarkup:
                notices.length > 0 ? probationStreakButtons(notices) : reportButtons('live'),
            },
          )
          return
        }

        const body = buildProbationStreakMessage(notice)
        await sendTelegramMessage(
          `<b>${escapeHtml(notice.name)}</b> · streak ${notice.level}\n\n` +
            escapeHtml(body) +
            (notice.level === 3 ? '\n\n<i>Sending this marks them fired (final streak).</i>' : ''),
          { chatId, parseMode: 'HTML' },
        )
        await markProbationNoticeMessaged(notice.id, await getServerToday())
        const remaining = await listPendingProbationNotices()
        await sendTelegramMessage(
          notice.level === 3
            ? `✅ Final streak ready · ${notice.name} fired. ${remaining.length} left on the streak list.`
            : `✅ Marked streak ${notice.level} as sent for ${notice.name}. They won’t reappear until the next streak. ${remaining.length} left.`,
          {
            chatId,
            replyMarkup:
              remaining.length > 0 ? probationStreakButtons(remaining) : reportButtons('live'),
          },
        )
      } catch (e) {
        await sendTelegramMessage(
          `Could not build creator streaks: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown error'}`,
          { chatId },
        )
      }
    })
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
          ? role === 'reposter'
            ? '✉️ Loading who is behind (reposters)…'
            : '✉️ Loading who is behind (creators)…'
          : view === 'list'
            ? '📋 Building the full list…'
            : mode === 'final'
              ? '📅 Building previous day…'
              : view === 'progress'
                ? '⏱ Building so-far today…'
                : '📊 Building update…'
      await sendTelegramMessage(ack, { chatId })
    }
    // Answer Telegram now; sending many messages can take a minute and it would retry.
    after(async () => {
      try {
        const { getOperationalToday } = await import('@/lib/queries')
        // Skip ensureCreatorTrackingColumns here — it burns cold-start time on every tap.
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
