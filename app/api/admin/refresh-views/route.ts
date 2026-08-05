import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { refreshViews, type RefreshViewsScope } from '@/lib/refresh-views'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
/** Keep under Vercel hobby/pro limits; client uses tiny chunks so we finish in time. */
export const maxDuration = 60

type Body = {
  scope?: RefreshViewsScope
  limit?: number
  offset?: number
}

function friendlyEnvError(): string {
  return 'TIKHUB_API_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then Redeploy.'
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: 'Unauthorized — log in as admin and try again.' },
      { status: 401 },
    )
  }
  if (!process.env.TIKHUB_API_KEY?.trim()) {
    return NextResponse.json({ error: friendlyEnvError() }, { status: 500 })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const raw = body.scope
  const scope: RefreshViewsScope =
    raw === 'recent' || raw === 'all' || raw === 'zeros' ? raw : 'zeros'

  // Hard-cap batch size so one request cannot 504.
  const limit = Math.min(8, Math.max(1, body.limit ?? 5))

  try {
    const result = await refreshViews(scope, {
      limit,
      offset: body.offset,
      delayMs: 60,
    })

    revalidatePath('/admin')
    revalidatePath('/submit')
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown refresh error'
    return NextResponse.json(
      {
        error: `Views refresh crashed: ${msg.slice(0, 240)}. Try again — progress is saved for videos that already succeeded.`,
      },
      { status: 500 },
    )
  }
}
