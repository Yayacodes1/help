import { NextResponse } from 'next/server'
import { getLeaderSession } from '@/lib/leader-auth'
import { getLeaderScope } from '@/lib/leaders'
import { handleRefreshJobGet, handleRefreshJobPost } from '@/lib/refresh-job-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await getLeaderSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized — log in as a leader and try again.' }, { status: 401 })
  }
  return handleRefreshJobGet({ kind: 'leader', actorId: String(session.id), leaderId: session.id })
}

export async function POST(req: Request) {
  const session = await getLeaderSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized — log in as a leader and try again.' }, { status: 401 })
  }
  const scope = await getLeaderScope(session.id)
  return handleRefreshJobPost(
    req,
    { kind: 'leader', actorId: String(session.id), leaderId: session.id },
    { creatorIds: scope.videoIds },
  )
}
