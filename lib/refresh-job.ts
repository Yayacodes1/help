import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { ensureRefreshJobTables } from '@/lib/schema'
import {
  refreshOneSubmission,
  type RefreshFilters,
} from '@/lib/refresh-views'
import { parseVideoPage, parseVideoPageSize } from '@/lib/video-page'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const BATCH = 25
const CONCURRENCY = 6

export type RefreshJobActor = {
  kind: 'admin' | 'leader'
  actorId?: string | null
  leaderId?: number | null
}

export type RefreshJobStatus = {
  id: number
  status: 'running' | 'completed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  remaining: number
  percent: number
  platformsFixed: number
  alreadyRunning?: boolean
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  lastError: string | null
  failures: { id: number; url: string; reason: string }[]
}

type JobRow = {
  id: number
  status: string
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  platforms_fixed: number
  started_at: string
  updated_at: string
  finished_at: string | null
  last_error: string | null
}

function asJob(row: JobRow, failures: RefreshJobStatus['failures'] = []): RefreshJobStatus {
  const total = Number(row.total) || 0
  const processed = Number(row.processed) || 0
  const remaining = Math.max(0, total - processed)
  return {
    id: row.id,
    status: row.status === 'completed' || row.status === 'cancelled' ? row.status : 'running',
    total,
    processed,
    succeeded: Number(row.succeeded) || 0,
    failed: Number(row.failed) || 0,
    skipped: Number(row.skipped) || 0,
    remaining,
    percent: total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0,
    platformsFixed: Number(row.platforms_fixed) || 0,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    lastError: row.last_error,
    failures,
  }
}

async function loadFailures(jobId: number): Promise<RefreshJobStatus['failures']> {
  const rows = (await sql`
    SELECT i.submission_id AS id, s.url, COALESCE(i.error, '') AS reason
    FROM refresh_job_items i
    JOIN submissions s ON s.id = i.submission_id
    WHERE i.job_id = ${jobId} AND i.status = 'failed'
    ORDER BY i.submission_id ASC
    LIMIT 40
  `) as { id: number; url: string; reason: string }[]
  return rows
}

async function loadJob(id: number): Promise<RefreshJobStatus | null> {
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error
    FROM refresh_jobs
    WHERE id = ${id}
    LIMIT 1
  `) as JobRow[]
  const row = rows[0]
  if (!row) return null
  return asJob(row, await loadFailures(id))
}

function filterArgs(filters: RefreshFilters) {
  const pageSize = parseVideoPageSize(
    filters.pageSize != null ? String(filters.pageSize) : undefined,
  )
  const page = parseVideoPage(filters.page != null ? String(filters.page) : undefined)
  return {
    from: filters.from && DATE_RE.test(filters.from) ? filters.from : null,
    to: filters.to && DATE_RE.test(filters.to) ? filters.to : null,
    creatorId: filters.creatorId && Number.isFinite(filters.creatorId) ? filters.creatorId : null,
    projectId: filters.projectId && Number.isFinite(filters.projectId) ? filters.projectId : null,
    role: filters.role === 'creator' || filters.role === 'reposter' ? filters.role : null,
    platform:
      filters.platform === 'instagram' || filters.platform === 'tiktok' ? filters.platform : null,
    ids: Array.isArray(filters.creatorIds) ? filters.creatorIds : null,
    pageSize,
    offset: (page - 1) * pageSize,
  }
}

export async function getLatestRefreshJob(actor: RefreshJobActor): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  const leaderId = actor.leaderId ?? null
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error
    FROM refresh_jobs
    WHERE actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
    ORDER BY id DESC
    LIMIT 1
  `) as JobRow[]
  const row = rows[0]
  if (!row) return null
  return asJob(row, await loadFailures(row.id))
}

async function getRunningJob(actor: RefreshJobActor): Promise<JobRow | null> {
  const leaderId = actor.leaderId ?? null
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error
    FROM refresh_jobs
    WHERE status = 'running'
      AND actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
    ORDER BY id DESC
    LIMIT 1
  `) as JobRow[]
  return rows[0] ?? null
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === '23505' || /duplicate key|unique constraint/i.test(message)
}

export async function startRefreshJob(
  actor: RefreshJobActor,
  filters: RefreshFilters,
): Promise<RefreshJobStatus> {
  await ensureRefreshJobTables()
  const running = await getRunningJob(actor)
  if (running) {
    await sql`
      UPDATE refresh_jobs
      SET status = 'cancelled', finished_at = NOW(), updated_at = NOW(),
          last_error = 'Replaced by a new this-page refresh'
      WHERE id = ${running.id} AND status = 'running'
    `
  }

  let job: JobRow
  try {
    const created = (await sql`
      INSERT INTO refresh_jobs (actor_kind, actor_id, leader_id, filters, status)
      VALUES (
        ${actor.kind},
        ${actor.actorId ?? null},
        ${actor.leaderId ?? null},
        ${JSON.stringify(filters)}::jsonb,
        'running'
      )
      RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                started_at, updated_at, finished_at, last_error
    `) as JobRow[]
    if (!created[0]) throw new Error('Could not create refresh job')
    job = created[0]
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const existing = await getRunningJob(actor)
    if (!existing) throw error
    return { ...asJob(existing, await loadFailures(existing.id)), alreadyRunning: true }
  }
  const f = filterArgs(filters)

  await sql`
    INSERT INTO refresh_job_items (job_id, submission_id, status, views_before)
    SELECT ${job.id}, page.id, 'pending', page.views
    FROM (
      SELECT s.id, s.views
      FROM submissions s
      JOIN creators c ON c.id = s.creator_id
      WHERE (${f.from}::date IS NULL OR s.video_date >= ${f.from}::date)
        AND (${f.to}::date IS NULL OR s.video_date <= ${f.to}::date)
        AND (${f.creatorId}::int IS NULL OR s.creator_id = ${f.creatorId})
        AND (${f.projectId}::int IS NULL OR s.project_id = ${f.projectId})
        AND (${f.role}::text IS NULL OR c.role = ${f.role})
        AND (${f.platform}::text IS NULL OR s.platform = ${f.platform})
        AND (${f.ids}::int[] IS NULL OR s.creator_id = ANY(${f.ids}::int[]))
      ORDER BY s.video_date DESC, s.created_at DESC, s.id DESC
      LIMIT ${f.pageSize} OFFSET ${f.offset}
    ) page
    ON CONFLICT (job_id, submission_id) DO NOTHING
  `

  const counted = (await sql`
    SELECT COUNT(*)::int AS total FROM refresh_job_items WHERE job_id = ${job.id}
  `) as { total: number }[]
  const total = Number(counted[0]?.total ?? 0)

  if (total === 0) {
    const done = (await sql`
      UPDATE refresh_jobs
      SET total = 0, status = 'completed', finished_at = NOW(), updated_at = NOW()
      WHERE id = ${job.id}
      RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                started_at, updated_at, finished_at, last_error
    `) as JobRow[]
    return asJob(done[0])
  }

  const updated = (await sql`
    UPDATE refresh_jobs
    SET total = ${total}, updated_at = NOW()
    WHERE id = ${job.id}
    RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
              started_at, updated_at, finished_at, last_error
  `) as JobRow[]
  return asJob(updated[0])
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]
      await fn(current)
    }
  })
  await Promise.all(workers)
}

async function actorOwnsJob(jobId: number, actor: RefreshJobActor): Promise<boolean> {
  const leaderId = actor.leaderId ?? null
  const rows = (await sql`
    SELECT id FROM refresh_jobs
    WHERE id = ${jobId}
      AND actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
    LIMIT 1
  `) as { id: number }[]
  return rows.length > 0
}

export async function tickRefreshJob(
  jobId: number,
  actor: RefreshJobActor,
): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  if (!(await actorOwnsJob(jobId, actor))) return null

  await sql`
    UPDATE refresh_job_items
    SET status = 'pending', started_at = NULL
    WHERE job_id = ${jobId}
      AND status = 'running'
      AND (started_at IS NULL OR started_at < NOW() - INTERVAL '2 minutes')
  `

  let claimed: { submission_id: number }[]
  try {
    claimed = (await sql`
      WITH next AS (
        SELECT id
        FROM refresh_job_items
        WHERE job_id = ${jobId} AND status = 'pending'
        ORDER BY submission_id ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE refresh_job_items i
      SET status = 'running', started_at = NOW()
      FROM next
      WHERE i.id = next.id
      RETURNING i.submission_id
    `) as { submission_id: number }[]
  } catch {
    claimed = (await sql`
      WITH next AS (
        SELECT id
        FROM refresh_job_items
        WHERE job_id = ${jobId} AND status = 'pending'
        ORDER BY submission_id ASC
        LIMIT ${BATCH}
      )
      UPDATE refresh_job_items i
      SET status = 'running', started_at = NOW()
      FROM next
      WHERE i.id = next.id AND i.status = 'pending'
      RETURNING i.submission_id
    `) as { submission_id: number }[]
  }

  if (claimed.length === 0) {
    const leftover = (await sql`
      SELECT COUNT(*)::int AS n
      FROM refresh_job_items
      WHERE job_id = ${jobId} AND status IN ('pending', 'running')
    `) as { n: number }[]
    if (Number(leftover[0]?.n ?? 0) === 0) {
      const done = (await sql`
        UPDATE refresh_jobs
        SET status = 'completed', finished_at = COALESCE(finished_at, NOW()), updated_at = NOW()
        WHERE id = ${jobId}
        RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                  started_at, updated_at, finished_at, last_error
      `) as JobRow[]
      return asJob(done[0], await loadFailures(jobId))
    }
    return loadJob(jobId)
  }

  const ids = claimed.map((row) => row.submission_id)
  const rows = (await sql`
    SELECT id, platform, url, views, platform_posted_at
    FROM submissions
    WHERE id = ANY(${ids}::int[])
  `) as Array<{
    id: number
    platform: Platform
    url: string
    views: number
    platform_posted_at: string | null
  }>
  const byId = new Map(rows.map((row) => [row.id, row]))

  let succeeded = 0
  let failed = 0
  let skipped = 0
  let platformsFixed = 0

  await mapPool(ids, CONCURRENCY, async (submissionId) => {
    const row = byId.get(submissionId)
    if (!row) {
      await sql`
        UPDATE refresh_job_items
        SET status = 'failed', error = 'Video not found'
        WHERE job_id = ${jobId} AND submission_id = ${submissionId}
      `
      failed += 1
      return
    }
    try {
      const one = await refreshOneSubmission(row)
      platformsFixed += one.platformsFixed
      if (one.outcome === 'updated') {
        succeeded += 1
        await sql`
          UPDATE refresh_job_items
          SET status = 'success', views_after = ${one.views ?? row.views}, error = NULL
          WHERE job_id = ${jobId} AND submission_id = ${submissionId}
        `
      } else if (one.outcome === 'skipped') {
        skipped += 1
        await sql`
          UPDATE refresh_job_items
          SET status = 'success', views_after = ${one.views ?? row.views}, error = NULL
          WHERE job_id = ${jobId} AND submission_id = ${submissionId}
        `
      } else {
        failed += 1
        await sql`
          UPDATE refresh_job_items
          SET status = 'failed', error = ${one.reason?.slice(0, 400) ?? 'refresh failed'}
          WHERE job_id = ${jobId} AND submission_id = ${submissionId}
        `
      }
    } catch (e) {
      failed += 1
      const reason = e instanceof Error ? e.message.slice(0, 400) : 'refresh failed'
      await sql`
        UPDATE refresh_job_items
        SET status = 'failed', error = ${reason}
        WHERE job_id = ${jobId} AND submission_id = ${submissionId}
      `
      await sql`
        UPDATE submissions
        SET views_error = ${reason}
        WHERE id = ${submissionId}
      `.catch(() => undefined)
    }
  })

  const processed = succeeded + failed + skipped
  const updated = (await sql`
    UPDATE refresh_jobs
    SET processed = processed + ${processed},
        succeeded = succeeded + ${succeeded},
        failed = failed + ${failed},
        skipped = skipped + ${skipped},
        platforms_fixed = platforms_fixed + ${platformsFixed},
        updated_at = NOW()
    WHERE id = ${jobId}
    RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
              started_at, updated_at, finished_at, last_error
  `) as JobRow[]

  const pending = (await sql`
    SELECT COUNT(*)::int AS n
    FROM refresh_job_items
    WHERE job_id = ${jobId} AND status IN ('pending', 'running')
  `) as { n: number }[]

  if (Number(pending[0]?.n ?? 0) === 0) {
    const done = (await sql`
      UPDATE refresh_jobs
      SET status = 'completed', finished_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}
      RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                started_at, updated_at, finished_at, last_error
    `) as JobRow[]
    return asJob(done[0], await loadFailures(jobId))
  }

  return asJob(updated[0], await loadFailures(jobId))
}

export async function retryFailedRefreshJob(
  jobId: number,
  actor: RefreshJobActor,
): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  if (!(await actorOwnsJob(jobId, actor))) return null

  const reset = (await sql`
    UPDATE refresh_job_items
    SET status = 'pending', error = NULL, started_at = NULL
    WHERE job_id = ${jobId} AND status = 'failed'
    RETURNING id
  `) as { id: number }[]
  const n = reset.length
  if (n === 0) return loadJob(jobId)
  const updated = (await sql`
    UPDATE refresh_jobs
    SET status = 'running',
        failed = 0,
        processed = GREATEST(processed - ${n}, 0),
        finished_at = NULL,
        updated_at = NOW(),
        last_error = NULL
    WHERE id = ${jobId}
    RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
              started_at, updated_at, finished_at, last_error
  `) as JobRow[]
  return asJob(updated[0])
}

/** Keep ticking a small this-page job until it finishes or the time budget runs out. */
export async function drainRefreshJob(
  jobId: number,
  actor: RefreshJobActor,
  budgetMs = 45_000,
): Promise<RefreshJobStatus | null> {
  const started = Date.now()
  let job = await loadJob(jobId)
  while (job && job.status === 'running' && Date.now() - started < budgetMs) {
    job = await tickRefreshJob(jobId, actor)
  }
  return job
}

/** Backup processor for the daily cron if a job was left running. */
export async function tickAnyRunningRefreshJob(): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  const rows = (await sql`
    SELECT id, actor_kind, leader_id
    FROM refresh_jobs
    WHERE status = 'running'
    ORDER BY updated_at ASC
    LIMIT 1
  `) as { id: number; actor_kind: 'admin' | 'leader'; leader_id: number | null }[]
  const row = rows[0]
  if (!row) return null
  return tickRefreshJob(row.id, {
    kind: row.actor_kind,
    leaderId: row.leader_id,
  })
}
