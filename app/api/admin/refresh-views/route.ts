import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { refreshViews, type RefreshViewsScope } from '@/lib/refresh-views'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Body = {
  scope?: RefreshViewsScope
  limit?: number
  offset?: number
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.DATALIKERS_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'DATALIKERS_API_KEY is not set' },
      { status: 500 },
    )
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const scope: RefreshViewsScope = body.scope === 'recent' ? 'recent' : 'all'
  const result = await refreshViews(scope, {
    limit: body.limit,
    offset: body.offset,
  })

  revalidatePath('/admin')
  revalidatePath('/submit')
  return NextResponse.json(result)
}
