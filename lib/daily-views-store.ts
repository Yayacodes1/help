import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import {
  aggregateDayGains,
  buildDailyViewsCompare,
  snapshotRiyadhDay,
  zonedDayStartUtc,
  type DailyViewsCompare,
  type ViewSnapshotPoint,
} from '@/lib/daily-views'
import { ensureOnce } from '@/lib/ensure-once'

export async function ensureViewSnapshotTable() {
  return ensureOnce('view-snapshots', async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS submission_view_snapshots (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        video_key TEXT,
        views INTEGER NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        riyadh_day DATE NOT NULL
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS submission_view_snapshots_video_time_idx
      ON submission_view_snapshots (submission_id, observed_at DESC)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS submission_view_snapshots_key_time_idx
      ON submission_view_snapshots (video_key, observed_at DESC)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS submission_view_snapshots_day_idx
      ON submission_view_snapshots (riyadh_day)
    `
    await sql`
      INSERT INTO submission_view_snapshots (submission_id, video_key, views, observed_at, riyadh_day)
      SELECT s.id,
             s.video_key,
             s.views,
             s.views_fetched_at,
             (s.views_fetched_at AT TIME ZONE 'Asia/Riyadh')::date
      FROM submissions s
      WHERE s.views_fetched_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM submission_view_snapshots x WHERE x.submission_id = s.id
        )
    `
  })
}

export async function recordViewSnapshot(input: {
  submissionId: number
  views: number
  videoKey?: string | null
  observedAt?: string | null
}): Promise<void> {
  if (!Number.isFinite(input.views) || input.views < 0) return
  await ensureViewSnapshotTable()
  const observedAt = input.observedAt && !Number.isNaN(Date.parse(input.observedAt))
    ? new Date(input.observedAt).toISOString()
    : new Date().toISOString()
  const riyadhDay = snapshotRiyadhDay(observedAt)
  const views = Math.floor(input.views)

  let videoKey = input.videoKey?.trim() || null
  if (!videoKey) {
    const rows = (await sql`
      SELECT video_key FROM submissions WHERE id = ${input.submissionId} LIMIT 1
    `) as { video_key: string | null }[]
    videoKey = rows[0]?.video_key ?? null
  }

  const last = (await sql`
    SELECT views, riyadh_day::text AS riyadh_day, observed_at
    FROM submission_view_snapshots
    WHERE submission_id = ${input.submissionId}
    ORDER BY observed_at DESC
    LIMIT 1
  `) as { views: number; riyadh_day: string; observed_at: string }[]
  const prev = last[0]
  if (
    prev &&
    Number(prev.views) === views &&
    prev.riyadh_day === riyadhDay &&
    Date.parse(observedAt) - Date.parse(prev.observed_at) < 2 * 60_000
  ) {
    return
  }

  await sql`
    INSERT INTO submission_view_snapshots (submission_id, video_key, views, observed_at, riyadh_day)
    VALUES (
      ${input.submissionId},
      ${videoKey},
      ${views},
      ${observedAt}::timestamptz,
      ${riyadhDay}::date
    )
  `
}

async function loadSnapshots(fromIso: string): Promise<ViewSnapshotPoint[]> {
  await ensureViewSnapshotTable()
  const rows = (await sql`
    SELECT COALESCE(NULLIF(video_key, ''), 'id:' || submission_id::text) AS video_id,
           views,
           to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at
    FROM submission_view_snapshots
    WHERE observed_at >= ${fromIso}::timestamptz
    ORDER BY 1, observed_at ASC
  `) as { video_id: string; views: number; observed_at: string }[]

  const older = (await sql`
    SELECT DISTINCT ON (COALESCE(NULLIF(video_key, ''), 'id:' || submission_id::text))
           COALESCE(NULLIF(video_key, ''), 'id:' || submission_id::text) AS video_id,
           views,
           to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at
    FROM submission_view_snapshots
    WHERE observed_at < ${fromIso}::timestamptz
    ORDER BY 1, observed_at DESC
  `) as { video_id: string; views: number; observed_at: string }[]

  return [...older, ...rows].map((row) => ({
    videoId: row.video_id,
    views: Number(row.views) || 0,
    observedAt: row.observed_at,
  }))
}

export async function loadDailyViewsCompare(
  currentDay: string,
  mode: 'live' | 'final',
  now: Date = new Date(),
): Promise<DailyViewsCompare> {
  const previousDay = addDays(currentDay, -1)
  const lookbackStart = zonedDayStartUtc(addDays(previousDay, -1)).toISOString()
  const snapshots = await loadSnapshots(lookbackStart)
  return buildDailyViewsCompare({
    mode,
    currentDay,
    current: aggregateDayGains(snapshots, currentDay, now),
    previous: aggregateDayGains(snapshots, previousDay, now),
  })
}

export async function kickCatalogViewRefresh(opts: { drainMs?: number } = {}): Promise<{
  started: boolean
  jobId?: number
  status?: string
  error?: string
}> {
  if (!process.env.TIKHUB_API_KEY?.trim()) {
    return { started: false, error: 'TIKHUB_API_KEY is not set' }
  }
  const { startRefreshJob, drainRefreshJob } = await import('@/lib/refresh-job')
  try {
    const started = await startRefreshJob(
      { kind: 'admin', actorId: 'cron-catalog' },
      { catalog: true, allMatching: true },
    )
    if (opts.drainMs && started.status === 'running') {
      const drained = await drainRefreshJob(started.id, { kind: 'admin', actorId: 'cron-catalog' }, opts.drainMs)
      return { started: true, jobId: drained?.id ?? started.id, status: drained?.status ?? started.status }
    }
    return { started: true, jobId: started.id, status: started.status }
  } catch (e) {
    return { started: false, error: e instanceof Error ? e.message : 'catalog refresh failed' }
  }
}
