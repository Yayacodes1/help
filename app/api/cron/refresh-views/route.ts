import { NextResponse } from 'next/server'
import { refreshViews } from '@/lib/refresh-views'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const header = req.headers.get('x-cron-secret')
  if (header === secret) return true
  const url = new URL(req.url)
  if (url.searchParams.get('secret') === secret) return true
  return false
}

async function run(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { getOperationalToday, getServerToday } = await import('@/lib/queries')
  const { syncReposterStrikes } = await import('@/lib/strikes')
  const { ensureCreatorTrackingColumns } = await import('@/lib/schema')
  const { sendAttendanceReports } = await import('@/lib/telegram-report')
  const { ensureTelegramWebhook } = await import('@/lib/telegram')
  await ensureCreatorTrackingColumns()
  const opToday = await getOperationalToday()
  const strikesAdded = await syncReposterStrikes({ today: opToday })
  const { ensureStreakEpoch } = await import('@/lib/streak-epoch')
  const streakEpoch = await ensureStreakEpoch(await getServerToday())
  const telegram = await sendAttendanceReports(opToday, 'final')
  const webhook = await ensureTelegramWebhook(new URL(req.url).origin).catch((e) => ({ ok: false, error: String(e) }))

  if (!process.env.TIKHUB_API_KEY?.trim()) {
    revalidatePath('/admin')
    revalidatePath('/submit')
    return NextResponse.json({
      error: 'TIKHUB_API_KEY is not set',
      strikesAdded,
      streakEpoch,
      telegram,
      webhook,
    }, { status: 500 })
  }

  const { tickAnyRunningRefreshJob } = await import('@/lib/refresh-job')
  let jobTicks = 0
  for (let i = 0; i < 8; i++) {
    const job = await tickAnyRunningRefreshJob()
    if (!job || job.status !== 'running') break
    jobTicks += 1
  }

  const url = new URL(req.url)
  const scopeParam = url.searchParams.get('scope')
  const { kickCatalogViewRefresh } = await import('@/lib/daily-views-store')
  const catalog = await kickCatalogViewRefresh({ drainMs: 120_000 })
  const recent =
    scopeParam === 'recent' ? await refreshViews('recent', { delayMs: 80, limit: 40 }) : null
  revalidatePath('/admin')
  revalidatePath('/submit')
  return NextResponse.json({ catalog, recent, jobTicks, strikesAdded, streakEpoch, telegram, webhook })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
