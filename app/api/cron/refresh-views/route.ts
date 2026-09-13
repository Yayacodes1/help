import { NextResponse } from 'next/server'
import { refreshViews, type RefreshViewsScope } from '@/lib/refresh-views'
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
  await ensureCreatorTrackingColumns()
  const opToday = await getOperationalToday()
  const strikesAdded = await syncReposterStrikes({ today: opToday })
  const { ensureStreakEpoch } = await import('@/lib/streak-epoch')
  const streakEpoch = await ensureStreakEpoch(await getServerToday())

  if (!process.env.TIKHUB_API_KEY?.trim()) {
    revalidatePath('/admin')
    revalidatePath('/submit')
    return NextResponse.json({
      error: 'TIKHUB_API_KEY is not set',
      strikesAdded,
      streakEpoch,
    }, { status: 500 })
  }

  const url = new URL(req.url)
  const scopeParam = url.searchParams.get('scope')
  // Default: today + yesterday once daily (Hobby allows 1 cron/day). Pass ?scope=all for rare full backfills.
  const scope: RefreshViewsScope = scopeParam === 'all' ? 'all' : 'recent'

  const result = await refreshViews(scope, { delayMs: 80, limit: 40 })
  revalidatePath('/admin')
  revalidatePath('/submit')
  return NextResponse.json({ ...result, strikesAdded, streakEpoch })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
