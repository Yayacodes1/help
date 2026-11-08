import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { ensureTelegramWebhook, telegramAllowedChatIds, telegramConfigured } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/** Admin-only: connect the bot's buttons/commands to this deployment. */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await ensureTelegramWebhook(new URL(req.url).origin)
  return NextResponse.json(
    {
      ...result,
      configured: telegramConfigured(),
      allowedChatCount: telegramAllowedChatIds().length,
      hint: result.ok
        ? 'Webhook refreshed. In the team Telegram group, send /update'
        : 'Fix the error, then open this URL again while logged into admin.',
    },
    { status: result.ok ? 200 : 500 },
  )
}
