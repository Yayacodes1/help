import 'server-only'

const TELEGRAM_API = 'https://api.telegram.org'

export function telegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim(),
  )
}

export async function sendTelegramMessage(
  text: string,
  opts?: { parseMode?: 'HTML' | 'Markdown' },
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' }
  }

  // Telegram hard limit ~4096 chars — split on blank lines when needed.
  const chunks = splitTelegramMessage(text, 4000)
  for (const chunk of chunks) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    }
    if (opts?.parseMode) body.parse_mode = opts.parseMode

    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return { ok: false, error: `Telegram ${res.status}: ${errText.slice(0, 300)}` }
    }
  }
  return { ok: true }
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
