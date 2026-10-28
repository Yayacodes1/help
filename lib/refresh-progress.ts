export type RefreshProgressInput = {
  status: 'running' | 'completed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped?: number
  waiting?: number
}

export function refreshJobPercent(job: RefreshProgressInput): number {
  const total = Math.max(0, Number(job.total) || 0)
  const processed = Math.max(0, Number(job.processed) || 0)
  if (job.status !== 'running') {
    return total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100
  }
  if (total === 0) return 0
  const waiting = Math.max(0, Number(job.waiting) || 0)
  const raw = Math.round((processed / total) * 100)
  if (waiting > 0 || processed < total || job.status === 'running') {
    return Math.min(99, raw)
  }
  return Math.min(99, raw)
}

export function refreshJobHeading(job: RefreshProgressInput): string {
  if (job.status === 'cancelled') return 'Refresh cancelled'
  if (job.status === 'completed') {
    return job.failed > 0 ? 'Refresh finished with failures' : 'Refresh complete'
  }
  if ((job.waiting ?? 0) > 0) return 'Waiting to retry this page'
  return 'Refreshing this page'
}

export function shouldShowRefreshCards(opts: {
  dismissed: boolean
  ownedJobId: number | null
  jobId: number | null
  pageCreatorId?: number | null
  jobCreatorId?: number | null
}): boolean {
  if (opts.dismissed) return false
  if (opts.ownedJobId == null || opts.jobId == null) return false
  if (opts.ownedJobId !== opts.jobId) return false
  if (opts.pageCreatorId != null && opts.jobCreatorId != null) {
    return opts.pageCreatorId === opts.jobCreatorId
  }
  return true
}

export function isRetryEligible(
  item: { status: string; retryAt?: string | null },
  now = Date.now(),
): boolean {
  if (item.status !== 'failed') return false
  if (!item.retryAt) return true
  const at = Date.parse(item.retryAt)
  if (Number.isNaN(at)) return true
  return at <= now
}

export type RefreshOutcomeRow = {
  id: number
  url: string
  status: string
  error?: string | null
  viewsBefore?: number | null
  viewsAfter?: number | null
  views?: number
  viewsFetchedAt?: string | null
}

export type RefreshLinkSample = {
  id: number
  url: string
  reason?: string
  views?: number
  viewsBefore?: number | null
  viewsAfter?: number | null
  viewsFetchedAt?: string | null
}

export function splitRefreshResults(rows: RefreshOutcomeRow[]): {
  updated: RefreshLinkSample[]
  unchanged: RefreshLinkSample[]
  failed: RefreshLinkSample[]
} {
  const updated: RefreshLinkSample[] = []
  const unchanged: RefreshLinkSample[] = []
  const failed: RefreshLinkSample[] = []
  for (const row of rows) {
    const sample: RefreshLinkSample = {
      id: row.id,
      url: row.url,
      reason: row.error ?? undefined,
      views: row.views ?? row.viewsAfter ?? row.viewsBefore ?? undefined,
      viewsBefore: row.viewsBefore,
      viewsAfter: row.viewsAfter,
      viewsFetchedAt: row.viewsFetchedAt,
    }
    if (row.status === 'failed') {
      failed.push(sample)
      continue
    }
    if (row.status !== 'success') continue
    const before = row.viewsBefore
    const after = row.viewsAfter
    if (
      typeof before === 'number' &&
      typeof after === 'number' &&
      Number.isFinite(before) &&
      Number.isFinite(after) &&
      after !== before
    ) {
      updated.push(sample)
    } else {
      unchanged.push(sample)
    }
  }
  return { updated, unchanged, failed }
}
