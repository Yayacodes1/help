import { NextResponse } from 'next/server'
import { refreshViewsForRecentDays } from '@/lib/refresh-views'
import { revalidatePath } from 'next/cache'

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

async function run(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.DATALIKERS_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'DATALIKERS_API_KEY is not set' },
      { status: 500 },
    )
  }

  const result = await refreshViewsForRecentDays()
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
