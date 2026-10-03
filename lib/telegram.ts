import 'server-only'
import { createHash } from 'crypto'

const TELEGRAM_API = 'https://api.telegram.org'

export function telegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim(),
  )
}

async function callTelegram(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { result?: unknown } | null
      return { ok: true, result: json?.result }
    }
    const errText = await res.text().catch(() => res.statusText)
    // Rate limited: Telegram says how long to wait.
    if (res.status === 429 && attempt < 3) {
      let wait = 5
      try {
        wait = Number(JSON.parse(errText)?.parameters?.retry_after) || 5
      } catch {}
      await new Promise((r) => setTimeout(r, Math.min(wait, 40) * 1000 + 250))
      continue
    }
    return { ok: false, error: `Telegram ${method} ${res.status}: ${errText.slice(0, 300)}` }
  }
}

export async function sendTelegramMessage(
  text: string,
  opts?: {
    parseMode?: 'HTML' | 'Markdown'
    /** Defaults to TELEGRAM_CHAT_ID. */
    chatId?: string | number
    /** Buttons go on the last chunk. */
    replyMarkup?: Record<string, unknown>
  },
): Promise<{ ok: boolean; error?: string }> {
  const chatId = opts?.chatId ?? process.env.TELEGRAM_CHAT_ID?.trim()
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' }
  }

  // Telegram hard limit ~4096 chars — split on blank lines when needed.
  const chunks = splitTelegramMessage(text, 4000)
  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
      disable_web_page_preview: true,
    }
    if (opts?.parseMode) body.parse_mode = opts.parseMode
    if (opts?.replyMarkup && i === chunks.length - 1) body.reply_markup = opts.replyMarkup
    const res = await callTelegram('sendMessage', body)
    if (!res.ok) return { ok: false, error: res.error }
  }
  return { ok: true }
}

export async function answerCallbackQuery(id: string, text?: string) {
  await callTelegram('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
}

/** Secret Telegram echoes back in `X-Telegram-Bot-Api-Secret-Token` on every webhook call. */
export function telegramWebhookSecret(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return null
  return createHash('sha256').update(`webhook:${token}`).digest('hex').slice(0, 48)
}

export const BOT_COMMANDS = [
  { command: 'update', description: 'Today so far (reposters + creators)' },
  { command: 'report', description: 'Yesterday, full day' },
  { command: 'messages', description: 'Today so far + a copy-ready message for each person' },
  { command: 'messages_yesterday', description: 'Yesterday + a copy-ready message for each person' },
  { command: 'help', description: 'What this bot can do' },
]

/** Points the bot at `${origin}/api/telegram/webhook` if it isn't already. */
export async function ensureTelegramWebhook(origin?: string): Promise<{ ok: boolean; url?: string; changed?: boolean; error?: string }> {
  const secret = telegramWebhookSecret()
  if (!secret) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  const base = prod ? `https://${prod}` : origin
  if (!base || !base.startsWith('https://')) return { ok: false, error: 'No public https URL for the webhook' }
  const url = `${base}/api/telegram/webhook`

  const info = await callTelegram('getWebhookInfo', {})
  const current = (info.result as { url?: string } | undefined)?.url
  if (current === url) {
    await callTelegram('setMyCommands', { commands: BOT_COMMANDS })
    return { ok: true, url, changed: false }
  }

  const set = await callTelegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })
  if (!set.ok) return { ok: false, url, error: set.error }
  await callTelegram('setMyCommands', { commands: BOT_COMMANDS })
  return { ok: true, url, changed: true }
}

function splitTelegramMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n\n', maxLen)
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('\n', maxLen)
    if (cut < maxLen * 0.4) cut = maxLen
    parts.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) parts.push(rest)
  return parts
}
