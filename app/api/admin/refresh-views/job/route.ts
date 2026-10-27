import { NextResponse } from 'next/server'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import { handleRefreshJobGet, handleRefreshJobPost } from '@/lib/refresh-job-http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized — log in as admin and try again.' }, { status: 401 })
  }
  const session = await getAdminSession()
  return handleRefreshJobGet({ kind: 'admin', actorId: session?.id ?? 'admin' })
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized — log in as admin and try again.' }, { status: 401 })
  }
  const session = await getAdminSession()
  return handleRefreshJobPost(req, { kind: 'admin', actorId: session?.id ?? 'admin' })
}
