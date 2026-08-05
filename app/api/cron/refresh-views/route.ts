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
  if (!process.env.TIKHUB_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'TIKHUB_API_KEY is not set' },
      { status: 500 },
    )
  }

  const url = new URL(req.url)
  const scopeParam = url.searchParams.get('scope')
  // Daily cron stays cheap (today+yesterday). Pass ?scope=all for a full backfill.
  const scope: RefreshViewsScope = scopeParam === 'all' ? 'all' : 'recent'

  const result = await refreshViews(scope)
  revalidatePath('/admin')
  revalidatePath('/submit')
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}
