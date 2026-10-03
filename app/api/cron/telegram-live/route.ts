import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (req.headers.get('x-cron-secret') === secret) return true
  return new URL(req.url).searchParams.get('secret') === secret
}

/** 5 PM Riyadh: "today so far" so people can still be nudged before midnight. */
async function run(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
  const { getOperationalToday } = await import('@/lib/queries')
  const { sendAttendanceReports } = await import('@/lib/telegram-report')
  const { ensureTelegramWebhook } = await import('@/lib/telegram')

  await ensureCreatorTrackingColumns()
  const opToday = await getOperationalToday()
  const telegram = await sendAttendanceReports(opToday, 'live')
  const webhook = await ensureTelegramWebhook(new URL(req.url).origin).catch((e) => ({
    ok: false,
    error: String(e),
  }))
  return NextResponse.json({ ok: telegram.ok, opToday, telegram, webhook })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
