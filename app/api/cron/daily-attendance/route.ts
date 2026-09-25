import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { refreshViews, type RefreshViewsScope } from '@/lib/refresh-views'

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
  const { sendDailyAttendanceTelegram } = await import('@/lib/attendance')
  const { ensureStreakEpoch } = await import('@/lib/streak-epoch')

  await ensureCreatorTrackingColumns()
  const opToday = await getOperationalToday()
  const strikesAdded = await syncReposterStrikes({ today: opToday })
  const streakEpoch = await ensureStreakEpoch(await getServerToday())
  const telegram = await sendDailyAttendanceTelegram(opToday)

  const url = new URL(req.url)
  const skipViews = url.searchParams.get('skipViews') === '1'
  let views: Awaited<ReturnType<typeof refreshViews>> | null = null
  let viewsError: string | null = null

  if (!skipViews) {
    if (!process.env.TIKHUB_API_KEY?.trim()) {
      viewsError = 'TIKHUB_API_KEY is not set'
    } else {
      const scopeParam = url.searchParams.get('scope')
      const scope: RefreshViewsScope = scopeParam === 'all' ? 'all' : 'recent'
      views = await refreshViews(scope, { delayMs: 80, limit: 40 })
    }
  }

  revalidatePath('/admin')
  revalidatePath('/submit')

  return NextResponse.json({
    ok: telegram.ok,
    opToday,
    day: telegram.day,
    strikesAdded,
    streakEpoch,
    telegramSkipped: telegram.skipped ?? false,
    telegramError: telegram.error ?? null,
    views,
    viewsError,
  })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
