import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

/** Lightweight RevenueCat downloads sync — runs separately so attendance timeouts cannot skip it. */
async function run(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { getServerToday } = await import('@/lib/queries')
  const { syncRevenueCatCatchUp } = await import('@/lib/revenuecat')
  const today = await getServerToday()
  const revenueCat = await syncRevenueCatCatchUp({ today }).catch((e) => [
    { appName: '*', projectId: null, days: 0, error: e instanceof Error ? e.message : String(e) },
  ])

  return NextResponse.json({ ok: true, today, revenueCat })
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
