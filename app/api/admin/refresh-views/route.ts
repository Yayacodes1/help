import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import {
  refreshViews,
  type RefreshFilters,
  type RefreshViewsScope,
} from '@/lib/refresh-views'
import { revalidatePath } from 'next/cache'
import type { Platform } from '@/lib/db'

export const dynamic = 'force-dynamic'
/** Keep under Vercel limits; client uses tiny chunks. */
export const maxDuration = 60

type Body = {
  scope?: RefreshViewsScope
  limit?: number
  offset?: number
  from?: string
  to?: string
  creatorId?: number
  projectId?: number
  platform?: Platform
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
    raw === 'recent' || raw === 'all' || raw === 'zeros' || raw === 'filtered'
      ? raw
      : 'filtered'

  const limit = Math.min(8, Math.max(1, body.limit ?? 5))

  const filters: RefreshFilters = {
    from: body.from ?? null,
    to: body.to ?? null,
    creatorId: body.creatorId ?? null,
    projectId: body.projectId ?? null,
    platform: body.platform ?? null,
  }

  try {
    const result = await refreshViews(scope, {
      limit,
      offset: body.offset,
      delayMs: 60,
      filters: scope === 'filtered' ? filters : undefined,
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
