import { NextResponse } from 'next/server'
import { handleRefreshJobGet, handleRefreshJobPost } from '@/lib/refresh-job-http'
import { reposterRefreshContext, teamSubmissionIds } from '@/lib/reposter-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type RouteContext = { params: Promise<{ username: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const { username } = await context.params
  const scope = await reposterRefreshContext(username)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return handleRefreshJobGet(scope.actor)
}

export async function POST(req: Request, context: RouteContext) {
  const { username } = await context.params
  const scope = await reposterRefreshContext(username)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const action = body.action ?? 'start'
  const submissionIds = await teamSubmissionIds(body.submissionIds, scope.teamIds)
  if (action === 'start' && submissionIds.length === 0) {
    return NextResponse.json({ error: 'No videos on this page.' }, { status: 400 })
  }

  const next = new Request(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      submissionIds,
      allMatching: false,
      role: 'creator',
      creatorId: undefined,
    }),
  })
  return handleRefreshJobPost(next, scope.actor, { creatorIds: scope.teamIds })
}
