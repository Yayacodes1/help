import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { ensureTelegramWebhook } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/** Admin-only: connect the bot's buttons/commands to this deployment. */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await ensureTelegramWebhook(new URL(req.url).origin)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
