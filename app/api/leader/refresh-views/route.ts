import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderScope } from '@/lib/leaders'
import { refreshViews, type RefreshFilters } from '@/lib/refresh-views'
import type { Platform } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Body = {
  limit?: number
  offset?: number
  from?: string
  to?: string
  creatorId?: number
  projectId?: number
  submissionId?: number
  role?: string
  platform?: Platform
}

/**
 * Same refresh as the admin one, writing to the same submissions rows,
 * but only ever touching videos of the signed-in leader's team.
 */
export async function POST(req: Request) {
  const session = await getLeaderSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized — log in as a leader and try again.' }, { status: 401 })
  }
  if (!process.env.TIKHUB_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'Views refresh is not set up on this deployment yet. Ask the admin.' },
      { status: 500 },
    )
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const scope = await getLeaderScope(session.id)
  if (body.creatorId != null && !scope.videoIds.includes(body.creatorId)) {
    return NextResponse.json({ error: 'That person is not on your team.' }, { status: 403 })
  }

  const filters: RefreshFilters = {
    from: body.from ?? null,
    to: body.to ?? null,
    creatorId: body.creatorId ?? null,
    projectId: body.projectId ?? null,
    submissionId: body.submissionId ?? null,
    role: body.role ?? null,
    platform: body.platform ?? null,
    creatorIds: scope.videoIds,
  }

  try {
    const result = await refreshViews('filtered', {
      limit: Math.min(8, Math.max(1, body.limit ?? 5)),
      offset: body.offset,
      delayMs: 60,
      filters,
    })
    revalidatePath('/leader', 'layout')
    revalidatePath('/admin')
    revalidatePath('/admin/creators', 'layout')
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
