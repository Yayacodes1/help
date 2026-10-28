import 'server-only'
import { sql } from '@/lib/db'
import type { Platform } from '@/lib/db'
import { ensureRefreshJobTables } from '@/lib/schema'
import {
  refreshOneSubmission,
  type RefreshFilters,
} from '@/lib/refresh-views'
import { normalizeSubmissionIds } from '@/lib/refresh-scope'
import { detectPlatformFromUrl, extractTikTokAwemeId } from '@/lib/media-url'
import { fetchTikTokViewsByAwemeIds } from '@/lib/tikhub'
import {
  refreshJobPercent,
  splitRefreshResults,
  type RefreshLinkSample,
} from '@/lib/refresh-progress'

const BATCH = 25
const CONCURRENCY = 2
const MAX_ATTEMPTS = 3
const ALL_MATCHING_CAP = 500
const CATALOG_CAP = 8000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
  waiting: number
  remaining: number
  percent: number
  platformsFixed: number
  alreadyRunning?: boolean
  creatorId: number | null
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  lastError: string | null
  updates: RefreshLinkSample[]
  unchanged: RefreshLinkSample[]
  failures: RefreshLinkSample[]
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
  creator_id?: number | null
}

function asJob(
  row: JobRow,
  extra: {
    failures?: RefreshJobStatus['failures']
    updates?: RefreshJobStatus['updates']
    unchanged?: RefreshJobStatus['unchanged']
    waiting?: number
  } = {},
): RefreshJobStatus {
  const total = Number(row.total) || 0
  const processed = Number(row.processed) || 0
  const waiting = Number(extra.waiting) || 0
  const remaining = Math.max(0, total - processed)
  return {
    id: row.id,
    status: row.status === 'completed' || row.status === 'cancelled' ? row.status : 'running',
    total,
    processed,
    succeeded: Number(row.succeeded) || 0,
    failed: Number(row.failed) || 0,
    skipped: Number(row.skipped) || 0,
    waiting,
    remaining,
    percent: refreshJobPercent({
      status: row.status === 'completed' || row.status === 'cancelled' ? row.status : 'running',
      total,
      processed,
      succeeded: Number(row.succeeded) || 0,
      failed: Number(row.failed) || 0,
      waiting,
    }),
    platformsFixed: Number(row.platforms_fixed) || 0,
    creatorId:
      row.creator_id != null && Number.isFinite(Number(row.creator_id)) && Number(row.creator_id) > 0
        ? Math.floor(Number(row.creator_id))
        : null,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    lastError: row.last_error,
    updates: extra.updates ?? [],
    unchanged: extra.unchanged ?? [],
    failures: extra.failures ?? [],
  }
}

async function countWaiting(jobId: number): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS n FROM refresh_job_items
    WHERE job_id = ${jobId} AND status = 'waiting'
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0)
}

async function loadOutcomes(jobId: number): Promise<{
  updates: RefreshJobStatus['updates']
  unchanged: RefreshJobStatus['unchanged']
  failures: RefreshJobStatus['failures']
}> {
  const rows = (await sql`
    SELECT i.submission_id AS id, s.url, i.status, i.error,
           i.views_before, i.views_after, s.views, s.views_fetched_at
    FROM refresh_job_items i
    JOIN submissions s ON s.id = i.submission_id
    WHERE i.job_id = ${jobId} AND i.status IN ('success', 'failed')
    ORDER BY i.submission_id ASC
    LIMIT 200
  `) as {
    id: number
    url: string
    status: string
    error: string | null
    views_before: number | null
    views_after: number | null
    views: number
    views_fetched_at: string | null
  }[]
  return splitRefreshResults(
    rows.map((row) => ({
      id: row.id,
      url: row.url,
      status: row.status,
      error: row.error,
      viewsBefore: row.views_before,
      viewsAfter: row.views_after,
      views: row.views,
      viewsFetchedAt: row.views_fetched_at,
    })),
  )
}

async function decorate(row: JobRow): Promise<RefreshJobStatus> {
  const outcomes = await loadOutcomes(row.id)
  return asJob(row, {
    ...outcomes,
    waiting: await countWaiting(row.id),
  })
}

async function loadJob(id: number): Promise<RefreshJobStatus | null> {
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error, creator_id
    FROM refresh_jobs
    WHERE id = ${id}
    LIMIT 1
  `) as JobRow[]
  const row = rows[0]
  if (!row) return null
  return decorate(row)
}

export async function getLatestRefreshJob(actor: RefreshJobActor): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  const leaderId = actor.leaderId ?? null
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error, creator_id
    FROM refresh_jobs
    WHERE actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
    ORDER BY id DESC
    LIMIT 1
  `) as JobRow[]
  const row = rows[0]
  if (!row) return null
  return decorate(row)
}

function scopedCreatorId(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(Number(value)) && Number(value) > 0
    ? Math.floor(Number(value))
    : null
}

async function getRunningJob(
  actor: RefreshJobActor,
  creatorId?: number | null,
): Promise<JobRow | null> {
  const leaderId = actor.leaderId ?? null
  const scoped = scopedCreatorId(creatorId)
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error, creator_id
    FROM refresh_jobs
    WHERE status = 'running'
      AND actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
      AND COALESCE(creator_id, 0) = ${scoped ?? 0}
    ORDER BY id DESC
    LIMIT 1
  `) as JobRow[]
  return rows[0] ?? null
}

async function getAnyRunningJob(actor: RefreshJobActor): Promise<JobRow | null> {
  const leaderId = actor.leaderId ?? null
  const rows = (await sql`
    SELECT id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
           started_at, updated_at, finished_at, last_error, creator_id
    FROM refresh_jobs
    WHERE status = 'running'
      AND actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
    ORDER BY id DESC
    LIMIT 1
  `) as JobRow[]
  return rows[0] ?? null
}

async function cancelRunningJobForCreator(
  actor: RefreshJobActor,
  creatorId: number | null,
  exceptJobId?: number | null,
): Promise<void> {
  const leaderId = actor.leaderId ?? null
  const skipId = exceptJobId ?? 0
  await sql`
    UPDATE refresh_jobs
    SET status = 'cancelled',
        finished_at = COALESCE(finished_at, NOW()),
        updated_at = NOW()
    WHERE status = 'running'
      AND actor_kind = ${actor.kind}
      AND (${leaderId}::int IS NULL OR leader_id = ${leaderId})
      AND COALESCE(creator_id, 0) = ${creatorId ?? 0}
      AND id <> ${skipId}
  `
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
  const snapshotIds = normalizeSubmissionIds(filters.submissionIds)
  const teamIds = Array.isArray(filters.creatorIds) ? filters.creatorIds : null
  const from = filters.from && DATE_RE.test(filters.from) ? filters.from : null
  const to = filters.to && DATE_RE.test(filters.to) ? filters.to : null
  const creatorId = scopedCreatorId(filters.creatorId)
  const projectId = filters.projectId && Number.isFinite(filters.projectId) ? filters.projectId : null
  const role = filters.role === 'creator' || filters.role === 'reposter' ? filters.role : null
  const platform =
    filters.platform === 'instagram' || filters.platform === 'tiktok' ? filters.platform : null

  await cancelRunningJobForCreator(actor, creatorId)

  async function insertJob(): Promise<JobRow> {
    const created = (await sql`
      INSERT INTO refresh_jobs (actor_kind, actor_id, leader_id, creator_id, filters, status)
      VALUES (
        ${actor.kind},
        ${actor.actorId ?? null},
        ${actor.leaderId ?? null},
        ${creatorId},
        ${JSON.stringify(filters)}::jsonb,
        'running'
      )
      RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                started_at, updated_at, finished_at, last_error, creator_id
    `) as JobRow[]
    if (!created[0]) throw new Error('Could not create refresh job')
    return created[0]
  }

  let job: JobRow
  try {
    job = await insertJob()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const sameCreator = await getRunningJob(actor, creatorId)
    if (sameCreator) {
      return { ...(await decorate(sameCreator)), alreadyRunning: true }
    }
    const blocking = await getAnyRunningJob(actor)
    if (blocking) {
      await sql`
        UPDATE refresh_jobs
        SET status = 'cancelled',
            finished_at = COALESCE(finished_at, NOW()),
            updated_at = NOW()
        WHERE id = ${blocking.id} AND status = 'running'
      `
    }
    try {
      job = await insertJob()
    } catch (retryError) {
      if (!isUniqueViolation(retryError)) throw retryError
      const existing = (await getRunningJob(actor, creatorId)) ?? (await getAnyRunningJob(actor))
      if (!existing) throw retryError
      return { ...(await decorate(existing)), alreadyRunning: true }
    }
  }

  const catalog = Boolean(filters.catalog)
  if (catalog) {
    await sql`
      INSERT INTO refresh_job_items (job_id, submission_id, status, views_before)
      SELECT ${job.id}, s.id, 'pending', s.views
      FROM submissions s
      ORDER BY s.id ASC
      LIMIT ${CATALOG_CAP}
      ON CONFLICT (job_id, submission_id) DO NOTHING
    `
  } else if (filters.allMatching) {
    await sql`
      INSERT INTO refresh_job_items (job_id, submission_id, status, views_before)
      SELECT ${job.id}, page.id, 'pending', page.views
      FROM (
        SELECT s.id, s.views
        FROM submissions s
        JOIN creators c ON c.id = s.creator_id
        WHERE (${from}::date IS NULL OR s.video_date >= ${from}::date)
          AND (${to}::date IS NULL OR s.video_date <= ${to}::date)
          AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
          AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
          AND (${role}::text IS NULL OR c.role = ${role})
          AND (${platform}::text IS NULL OR s.platform = ${platform})
          AND (${teamIds}::int[] IS NULL OR s.creator_id = ANY(${teamIds}::int[]))
        ORDER BY s.video_date DESC, s.created_at DESC, s.id DESC
        LIMIT ${ALL_MATCHING_CAP}
      ) page
      ON CONFLICT (job_id, submission_id) DO NOTHING
    `
  } else if (snapshotIds.length > 0) {
    await sql`
      INSERT INTO refresh_job_items (job_id, submission_id, status, views_before)
      SELECT ${job.id}, s.id, 'pending', s.views
      FROM submissions s
      WHERE s.id = ANY(${snapshotIds}::int[])
        AND (${creatorId}::int IS NULL OR s.creator_id = ${creatorId})
        AND (${teamIds}::int[] IS NULL OR s.creator_id = ANY(${teamIds}::int[]))
      ON CONFLICT (job_id, submission_id) DO NOTHING
    `
  }

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
                started_at, updated_at, finished_at, last_error, creator_id
    `) as JobRow[]
    return decorate(done[0])
  }

  const updated = (await sql`
    UPDATE refresh_jobs
    SET total = ${total}, updated_at = NOW()
    WHERE id = ${job.id}
    RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
              started_at, updated_at, finished_at, last_error, creator_id
  `) as JobRow[]
  return decorate(updated[0])
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
  const current = await loadJob(jobId)
  if (!current || current.status !== 'running') return current

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
        WHERE job_id = ${jobId}
          AND attempts < ${MAX_ATTEMPTS}
          AND (
            status = 'pending'
            OR (status = 'waiting' AND (retry_at IS NULL OR retry_at <= NOW()))
          )
        ORDER BY submission_id ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE refresh_job_items i
      SET status = 'running', started_at = NOW(), attempts = COALESCE(i.attempts, 0) + 1
      FROM next
      WHERE i.id = next.id
      RETURNING i.submission_id
    `) as { submission_id: number }[]
  } catch {
    claimed = (await sql`
      WITH next AS (
        SELECT id
        FROM refresh_job_items
        WHERE job_id = ${jobId}
          AND attempts < ${MAX_ATTEMPTS}
          AND (
            status = 'pending'
            OR (status = 'waiting' AND (retry_at IS NULL OR retry_at <= NOW()))
          )
        ORDER BY submission_id ASC
        LIMIT ${BATCH}
      )
      UPDATE refresh_job_items i
      SET status = 'running', started_at = NOW(), attempts = COALESCE(i.attempts, 0) + 1
      FROM next
      WHERE i.id = next.id AND i.status IN ('pending', 'waiting')
      RETURNING i.submission_id
    `) as { submission_id: number }[]
  }

  if (claimed.length === 0) {
    const exhausted = (await sql`
      UPDATE refresh_job_items
      SET status = 'failed',
          error = COALESCE(NULLIF(error, ''), 'Retry budget exhausted')
      WHERE job_id = ${jobId}
        AND status = 'waiting'
        AND attempts >= ${MAX_ATTEMPTS}
      RETURNING id
    `) as { id: number }[]
    if (exhausted.length > 0) {
      await sql`
        UPDATE refresh_jobs
        SET processed = processed + ${exhausted.length},
            failed = failed + ${exhausted.length},
            updated_at = NOW()
        WHERE id = ${jobId}
      `
    }
    const leftover = (await sql`
      SELECT COUNT(*)::int AS n
      FROM refresh_job_items
      WHERE job_id = ${jobId} AND status IN ('pending', 'running', 'waiting')
    `) as { n: number }[]
    if (Number(leftover[0]?.n ?? 0) === 0) {
      const done = (await sql`
        UPDATE refresh_jobs
        SET status = 'completed', finished_at = COALESCE(finished_at, NOW()), updated_at = NOW()
        WHERE id = ${jobId}
        RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                  started_at, updated_at, finished_at, last_error, creator_id
      `) as JobRow[]
      return decorate(done[0])
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
  const awemeByRow = new Map<number, string>()
  for (const row of rows) {
    const platform = detectPlatformFromUrl(row.url) ?? row.platform
    if (platform !== 'tiktok') continue
    const awemeId = extractTikTokAwemeId(row.url)
    if (awemeId) awemeByRow.set(row.id, awemeId)
  }
  const batchHits =
    awemeByRow.size > 0
      ? await fetchTikTokViewsByAwemeIds([...new Set(awemeByRow.values())])
      : new Map()

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
      const awemeId = awemeByRow.get(submissionId)
      const preloaded = awemeId ? batchHits.get(awemeId) : undefined
      const one = await refreshOneSubmission(row, {
        retryTransient: false,
        preloaded,
      })
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
      } else if (one.outcome === 'waiting') {
        const waitMs = Math.min(60_000, Math.max(1_000, one.retryAfterMs ?? 5_000))
        const waited = (await sql`
          UPDATE refresh_job_items
          SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'waiting' END,
              error = ${one.reason?.slice(0, 400) ?? 'Rate limited'},
              retry_at = NOW() + (${Math.ceil(waitMs / 1000)}::int * INTERVAL '1 second')
          WHERE job_id = ${jobId} AND submission_id = ${submissionId}
          RETURNING status
        `) as { status: string }[]
        if (waited[0]?.status === 'failed') failed += 1
      } else {
        failed += 1
        await sql`
          UPDATE refresh_job_items
          SET status = 'failed', error = ${one.reason?.slice(0, 400) ?? 'refresh failed'}
          WHERE job_id = ${jobId} AND submission_id = ${submissionId}
        `
      }
      console.warn('[refresh-item]', {
        jobId,
        videoId: submissionId,
        platform: row.platform,
        outcome: one.outcome,
        reason: one.reason?.slice(0, 200) ?? null,
      })
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
              started_at, updated_at, finished_at, last_error, creator_id
  `) as JobRow[]

  const pending = (await sql`
    SELECT COUNT(*)::int AS n
    FROM refresh_job_items
    WHERE job_id = ${jobId} AND status IN ('pending', 'running', 'waiting')
  `) as { n: number }[]

  if (Number(pending[0]?.n ?? 0) === 0) {
    const done = (await sql`
      UPDATE refresh_jobs
      SET status = 'completed', finished_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}
      RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
                started_at, updated_at, finished_at, last_error, creator_id
    `) as JobRow[]
    return decorate(done[0])
  }

  return decorate(updated[0])
}

export async function retryFailedRefreshJob(
  jobId: number,
  actor: RefreshJobActor,
): Promise<RefreshJobStatus | null> {
  await ensureRefreshJobTables()
  if (!(await actorOwnsJob(jobId, actor))) return null
  const existing = await loadJob(jobId)
  if (!existing) return null
  await cancelRunningJobForCreator(actor, existing.creatorId, jobId)

  const reset = (await sql`
    UPDATE refresh_job_items
    SET status = 'pending', error = NULL, started_at = NULL, attempts = 0, retry_at = NULL
    WHERE job_id = ${jobId}
      AND status = 'failed'
      AND (retry_at IS NULL OR retry_at <= NOW())
    RETURNING id
  `) as { id: number }[]
  const n = reset.length
  if (n === 0) return loadJob(jobId)
  const updated = (await sql`
    UPDATE refresh_jobs
    SET status = 'running',
        failed = GREATEST(failed - ${n}, 0),
        processed = GREATEST(processed - ${n}, 0),
        finished_at = NULL,
        updated_at = NOW(),
        last_error = NULL
    WHERE id = ${jobId}
    RETURNING id, status, total, processed, succeeded, failed, skipped, platforms_fixed,
              started_at, updated_at, finished_at, last_error, creator_id
  `) as JobRow[]
  return decorate(updated[0])
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
    const processedBefore = job.processed
    job = await tickRefreshJob(jobId, actor)
    if (!job || job.status !== 'running') break
    if (job.processed <= processedBefore) {
      const pause = job.waiting > 0 ? 1_500 : 250
      if (Date.now() - started + pause >= budgetMs) break
      await new Promise((r) => setTimeout(r, pause))
    }
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
