import { NextResponse } from 'next/server'
import type { Platform } from '@/lib/db'
import type { RefreshFilters } from '@/lib/refresh-views'
import {
  drainRefreshJob,
  getLatestRefreshJob,
  retryFailedRefreshJob,
  startRefreshJob,
  tickRefreshJob,
  type RefreshJobActor,
} from '@/lib/refresh-job'

export const JOB_MAX_DURATION = 60

type Body = {
  action?: 'start' | 'tick' | 'retry' | 'status'
  jobId?: number
  from?: string
  to?: string
  creatorId?: number
  projectId?: number
  role?: string
  platform?: Platform
  page?: number
  pageSize?: number
}

function filtersFrom(body: Body, extra?: Partial<RefreshFilters>): RefreshFilters {
  return {
    from: body.from ?? extra?.from ?? null,
    to: body.to ?? extra?.to ?? null,
    creatorId: body.creatorId ?? extra?.creatorId ?? null,
    projectId: body.projectId ?? extra?.projectId ?? null,
    role: body.role ?? extra?.role ?? null,
    platform: body.platform ?? extra?.platform ?? null,
    creatorIds: extra?.creatorIds ?? null,
    page: body.page ?? extra?.page ?? null,
    pageSize: body.pageSize ?? extra?.pageSize ?? null,
  }
}

export async function handleRefreshJobGet(actor: RefreshJobActor) {
  const job = await getLatestRefreshJob(actor)
  return NextResponse.json({ job })
}

export async function handleRefreshJobPost(
  req: Request,
  actor: RefreshJobActor,
  extra?: Partial<RefreshFilters>,
) {
  if (!process.env.TIKHUB_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          actor.kind === 'leader'
            ? 'Views refresh is not set up on this deployment yet. Ask the admin.'
            : 'TIKHUB_API_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then Redeploy.',
      },
      { status: 500 },
    )
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }

  const action = body.action ?? 'start'
  const jobId = body.jobId && Number.isFinite(body.jobId) ? Math.floor(body.jobId) : null

  try {
    if (action === 'status') {
      const job = await getLatestRefreshJob(actor)
      return NextResponse.json({ job })
    }
    if (action === 'tick') {
      if (jobId == null) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
      const job = await tickRefreshJob(jobId, actor)
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return NextResponse.json({ job })
    }
    if (action === 'retry') {
      if (jobId == null) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
      const retried = await retryFailedRefreshJob(jobId, actor)
      if (!retried) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      const job =
        retried.status === 'running'
          ? (await drainRefreshJob(retried.id, actor)) ?? retried
          : retried
      return NextResponse.json({ job })
    }

    const started = await startRefreshJob(actor, filtersFrom(body, extra))
    const job =
      started.status === 'running' && started.total > 0
        ? (await drainRefreshJob(started.id, actor)) ?? started
        : started
    return NextResponse.json({ job })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown refresh error'
    return NextResponse.json(
      { error: `Views refresh crashed: ${msg.slice(0, 240)}` },
      { status: 500 },
    )
  }
}
