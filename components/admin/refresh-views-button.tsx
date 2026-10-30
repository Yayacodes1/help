'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, X } from 'lucide-react'
import type { RefreshLinkSample } from '@/lib/refresh-progress'
import type { Platform } from '@/lib/db'
import type { RoleFilter } from '@/lib/participant-role'
import { publicViewsError } from '@/lib/tikhub-errors'
import { refreshJobHeading, shouldShowRefreshCards } from '@/lib/refresh-progress'
import { snapshotRefreshTarget } from '@/lib/refresh-scope'

const ADMIN_ENDPOINT = '/api/admin/refresh-views'

type ChunkResult = {
  checked: number
  updated: number
  skipped: number
  failed: number
  platformsFixed?: number
  nextOffset: number | null
  hasMore: boolean
  views?: number
  failures?: { reason: string; count: number }[]
  failureSamples?: { id: number; url: string; reason: string }[]
}

export const SUBMISSION_VIEWS_EVENT = 'submission-views'

export function announceSubmissionViews(
  id: number,
  views: number,
  extra: { error?: string | null } = {},
) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(SUBMISSION_VIEWS_EVENT, {
      detail: { id, views, error: extra.error ?? null },
    }),
  )
}

function explainHttpError(status: number, apiError?: string): string {
  if (apiError?.trim()) return apiError.trim()
  if (status === 401) {
    return 'Not logged in (401). Refresh the page and sign in again.'
  }
  if (status === 502 || status === 503 || status === 504) {
    return `Server timed out (${status}). Progress is kept — click Refresh again to continue.`
  }
  if (status === 500) {
    return 'Server error (500). Check TIKHUB_API_KEY on Vercel or try again.'
  }
  return `Refresh failed (HTTP ${status}).`
}

type RefreshFilterInput = {
  from?: string
  to?: string
  creatorId?: number
  projectId?: number
  submissionId?: number
  role?: string
  platform?: Platform
  page?: number
  pageSize?: number
}

function readFilters(
  params: URLSearchParams,
  defaults: { from?: string; to?: string },
  overrides: {
    creatorId?: number
    allDates?: boolean
    submissionId?: number
  } = {},
  defaultRole: RoleFilter = 'creator',
): RefreshFilterInput {
  const pageRaw = Number(params.get('vPage') || '1')
  const sizeRaw = Number(params.get('vSize') || '50')
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const pageSize = sizeRaw === 25 || sizeRaw === 50 || sizeRaw === 100 ? sizeRaw : 50

  if (overrides.submissionId) {
    return {
      creatorId: overrides.creatorId,
      submissionId: overrides.submissionId,
    }
  }

  if (overrides.allDates) {
    return {
      creatorId: overrides.creatorId,
      page,
      pageSize,
    }
  }

  const from = params.get('from') || defaults.from || undefined
  const to = params.get('to') || defaults.to || undefined
  const creatorRaw = params.get('creator')
  const projectRaw = params.get('project')
  const roleRaw = params.get('role') ?? defaultRole
  const platformRaw = params.get('platform')
  const creatorFromUrl = creatorRaw ? Number(creatorRaw) : undefined
  const projectId =
    projectRaw && Number.isFinite(Number(projectRaw)) ? Number(projectRaw) : undefined
  const role =
    roleRaw === 'all' ? undefined : roleRaw === 'reposter' ? 'reposter' : 'creator'
  const platform =
    platformRaw === 'instagram' || platformRaw === 'tiktok'
      ? (platformRaw as Platform)
      : undefined

  return {
    from,
    to,
    creatorId: overrides.creatorId ?? (Number.isFinite(creatorFromUrl) ? creatorFromUrl : undefined),
    projectId: Number.isFinite(projectId) ? projectId : undefined,
    role,
    platform,
    page,
    pageSize,
  }
}

async function fetchChunk(
  offset: number,
  limit: number,
  filters: ReturnType<typeof readFilters>,
  endpoint: string = ADMIN_ENDPOINT,
): Promise<ChunkResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'filtered',
      limit,
      offset,
      from: filters.from,
      to: filters.to,
      creatorId: filters.creatorId,
      projectId: filters.projectId,
      submissionId: filters.submissionId,
      role: filters.role,
      platform: filters.platform,
    }),
  })

  const data = (await res.json().catch(() => null)) as
    | (ChunkResult & { error?: string })
    | null

  if (!res.ok) {
    throw new Error(explainHttpError(res.status, data?.error))
  }
  if (!data) {
    throw new Error('Empty response from views refresh. Try again.')
  }
  return data
}

async function fetchChunkRetry(
  offset: number,
  limit: number,
  filters: ReturnType<typeof readFilters>,
  endpoint: string = ADMIN_ENDPOINT,
): Promise<ChunkResult> {
  let last: unknown
  for (let i = 0; i < 4; i++) {
    try {
      return await fetchChunk(offset, limit, filters, endpoint)
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
  }
  throw last instanceof Error ? last : new Error('Refresh failed')
}

type JobStatus = {
  id: number
  status: 'running' | 'completed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  waiting?: number
  remaining: number
  percent: number
  alreadyRunning?: boolean
  creatorId?: number | null
  startedAt?: string
  finishedAt?: string | null
  updates?: RefreshLinkSample[]
  unchanged?: RefreshLinkSample[]
  failures: RefreshLinkSample[]
}

function LinkResultList({
  title,
  rows,
  tone,
  bare = false,
}: {
  title: string
  rows: RefreshLinkSample[]
  tone: 'ok' | 'muted' | 'bad'
  bare?: boolean
}) {
  if (rows.length === 0) return null
  const color =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
      : tone === 'bad'
        ? 'text-foreground'
        : 'border-border bg-muted/40 text-muted-foreground'
  const list = (
    <ul className={`${bare ? 'mt-1' : 'mt-1'} max-h-40 space-y-1 overflow-y-auto`}>
      {rows.map((row) => (
        <li key={`${title}-${row.id}`} className="break-all text-foreground">
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            dir="ltr"
          >
            {row.url}
          </a>
          {typeof row.viewsBefore === 'number' && typeof row.viewsAfter === 'number' ? (
            <span className="text-muted-foreground">
              {' '}
              · {row.viewsBefore.toLocaleString()} → {row.viewsAfter.toLocaleString()}
            </span>
          ) : typeof row.views === 'number' ? (
            <span className="text-muted-foreground"> · {row.views.toLocaleString()} views</span>
          ) : null}
          {row.reason ? (
            <span className="text-muted-foreground">
              {' '}
              · {publicViewsError(row.reason)}
              {row.viewsFetchedAt ? ` (${formatClock(row.viewsFetchedAt)})` : ''}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
  if (bare) return list
  return (
    <div className={`rounded-md border p-2 text-xs ${color}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      {list}
    </div>
  )
}

function formatClock(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString()
}

function announceJobRows(job: JobStatus) {
  for (const row of job.updates ?? []) {
    if (typeof row.viewsAfter === 'number') {
      announceSubmissionViews(row.id, row.viewsAfter, { error: null })
    }
  }
  for (const row of job.unchanged ?? []) {
    if (typeof row.views === 'number') {
      announceSubmissionViews(row.id, row.views, { error: null })
    }
  }
}

async function jobRequest(
  endpoint: string,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST',
): Promise<JobStatus | null> {
  const res = await fetch(endpoint, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => null)) as
    | { job?: JobStatus | null; error?: string }
    | null
  if (!res.ok) {
    throw new Error(explainHttpError(res.status, data?.error))
  }
  return data?.job ?? null
}

export function RefreshViewsButton({
  label,
  allLabel = 'Refresh all views',
  defaultFrom,
  defaultTo,
  creatorId,
  allDates = false,
  endpoint = ADMIN_ENDPOINT,
  defaultRole = 'creator',
  submissionIds,
}: {
  label: string
  allLabel?: string
  defaultFrom?: string
  defaultTo?: string
  creatorId?: number
  allDates?: boolean
  /** Leaders post to their own route, which only refreshes their team's videos. */
  endpoint?: string
  /** Role used when the URL has no `?role=` (admin: creators, leader: everyone). */
  defaultRole?: RoleFilter
  /** Exact videos currently displayed. Required for bulk refresh. */
  submissionIds?: number[]
}) {
  const searchParams = useSearchParams()
  const jobEndpoint = `${endpoint.replace(/\/$/, '')}/job`
  const [job, setJob] = useState<JobStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [launching, setLaunching] = useState(false)
  const driveGen = useRef(0)
  const starting = useRef(false)
  const cancelled = useRef(false)
  const dismissedRef = useRef(false)
  const ownedJobId = useRef<number | null>(null)
  const ownedCreatorId = useRef<number | null>(null)
  const pageCreatorRef = useRef<number | null>(creatorId ?? null)
  const lastProcessed = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScope = useRef<{ creatorId?: number; endpoint: string } | null>(null)
  pageCreatorRef.current = creatorId ?? null

  function clearHideTimer() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  function hideCards(immediate = false) {
    dismissedRef.current = true
    setDismissed(true)
    setMessage(null)
    setIsError(false)
    clearHideTimer()
    if (immediate) {
      setJob(null)
      return
    }
    hideTimer.current = setTimeout(() => {
      if (dismissedRef.current) setJob(null)
    }, 220)
  }

  function acceptJobUpdate(next: JobStatus): boolean {
    if (cancelled.current || dismissedRef.current) return false
    if (ownedJobId.current == null || ownedJobId.current !== next.id) return false
    const pageCreator = pageCreatorRef.current
    const jobCreator = next.creatorId ?? ownedCreatorId.current
    if (pageCreator != null && jobCreator != null && pageCreator !== jobCreator) return false
    return true
  }

  useEffect(() => {
    cancelled.current = false
    const prev = lastScope.current
    lastScope.current = { creatorId, endpoint: jobEndpoint }
    if (prev && (prev.creatorId !== creatorId || prev.endpoint !== jobEndpoint)) {
      hideCards(true)
      ownedJobId.current = null
      ownedCreatorId.current = null
    }
    return () => {
      cancelled.current = true
      driveGen.current += 1
      clearHideTimer()
    }
  }, [creatorId, jobEndpoint])

  async function drive(current: JobStatus) {
    const gen = ++driveGen.current
    const jobId = current.id
    lastProcessed.current = current.processed
    let next = current
    try {
      while (next.status === 'running' && driveGen.current === gen) {
        next =
          (await jobRequest(jobEndpoint, { action: 'tick', jobId })) ?? next
        if (driveGen.current !== gen) break
        if (acceptJobUpdate(next)) {
          setJob(next)
          announceJobRows(next)
        }
        if (next.status !== 'running') break
        if (next.processed <= lastProcessed.current) {
          const pause = (next.waiting ?? 0) > 0 ? 1_500 : 400
          await new Promise((r) => setTimeout(r, pause))
        }
        lastProcessed.current = next.processed
      }
      if (driveGen.current !== gen) return
      if (acceptJobUpdate(next)) {
        setIsError(next.failed > 0)
        setMessage(
          next.total === 0
            ? 'No videos on this page.'
            : `Done — ${next.succeeded + next.skipped} saved, ${next.failed} failed (${next.total} videos).`,
        )
      }
    } catch (e) {
      if (driveGen.current !== gen || cancelled.current || dismissedRef.current) return
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
    }
  }

  useEffect(() => {
    if (job?.status === 'running' && ownedJobId.current === job.id && !dismissedRef.current) {
      void drive(job)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status === 'running'])

  function dismissPanel() {
    hideCards()
  }

  async function start(action: 'start' | 'retry' | 'all' = 'start') {
    if (starting.current) return
    const cardsOpen =
      !dismissedRef.current &&
      job != null &&
      ownedJobId.current === job.id
    if (cardsOpen && job.status === 'running') return
    const target = snapshotRefreshTarget({
      creatorId,
      submissionIds,
      allMatching: action === 'all',
    })
    const retryJobId = action === 'retry' ? ownedJobId.current : null
    if (action === 'retry' && retryJobId == null) return
    starting.current = true
    setLaunching(true)
    clearHideTimer()
    dismissedRef.current = false
    setDismissed(false)
    setMessage(null)
    setIsError(false)
    const filters = readFilters(
      searchParams,
      { from: defaultFrom, to: defaultTo },
      { creatorId: target.creatorId ?? undefined, allDates },
      defaultRole,
    )
    try {
      if (action === 'start' && target.submissionIds.length === 0) {
        setMessage('No videos on this page.')
        return
      }
      const started =
        action === 'retry' && retryJobId != null
          ? await jobRequest(jobEndpoint, { action: 'retry', jobId: retryJobId })
          : await jobRequest(jobEndpoint, {
              action: 'start',
              ...filters,
              creatorId: target.creatorId ?? undefined,
              submissionIds: target.submissionIds,
              allMatching: target.allMatching,
            })
      if (!started) throw new Error('Could not start refresh.')
      if (cancelled.current || pageCreatorRef.current !== (creatorId ?? null)) return
      ownedJobId.current = started.id
      ownedCreatorId.current = started.creatorId ?? target.creatorId
      dismissedRef.current = false
      setDismissed(false)
      setJob(started)
      if (started.status === 'completed') {
        setIsError(started.failed > 0)
        setMessage(
          started.total === 0
            ? target.allMatching
              ? 'No videos match these filters.'
              : 'No videos on this page.'
            : `Done — ${started.succeeded + started.skipped} saved, ${started.failed} failed (${started.total} videos).`,
        )
        announceJobRows(started)
      }
    } catch (e) {
      if (cancelled.current || dismissedRef.current) return
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      starting.current = false
      setLaunching(false)
    }
  }

  const showPanel = shouldShowRefreshCards({
    dismissed,
    ownedJobId: ownedJobId.current,
    jobId: job?.id ?? null,
    pageCreatorId: creatorId ?? null,
    jobCreatorId: job?.creatorId ?? ownedCreatorId.current,
  })
  const running = Boolean(launching || (showPanel && job?.status === 'running'))
  const waiting = job?.waiting ?? 0
  const startedLabel = formatClock(job?.startedAt)
  const finishedLabel = formatClock(job?.finishedAt)
  const heading = job
    ? refreshJobHeading({
        status: job.status,
        total: job.total,
        processed: job.processed,
        succeeded: job.succeeded,
        failed: job.failed,
        waiting,
      })
    : 'Refreshing this page'
  const updates = job?.updates ?? []
  const unchanged = job?.unchanged ?? []
  const failures = job?.failures ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={() => void start('start')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        >
          {label}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void start('all')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        >
          {allLabel}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {label} refreshes only this page. {allLabel} refreshes every matching video, not just this
        page.
      </p>
      <div
        className={`grid max-w-3xl transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
          showPanel && job ? 'mt-0 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!showPanel}
      >
        <div className="overflow-hidden">
          {job ? (
            <div className="space-y-2 pb-0.5">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{heading}</p>
                  <button
                    type="button"
                    onClick={dismissPanel}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Dismiss refresh progress and failed videos"
                    title="Dismiss"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${job.percent}%` }}
                  />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                  <div>Total videos: {job.total.toLocaleString()}</div>
                  <div>Processed: {job.processed.toLocaleString()}</div>
                  <div>Updated: {updates.length.toLocaleString()}</div>
                  <div>Not updated: {unchanged.length.toLocaleString()}</div>
                  <div>Failed: {job.failed.toLocaleString()}</div>
                  <div>Waiting to retry: {waiting.toLocaleString()}</div>
                  <div>Remaining: {job.remaining.toLocaleString()}</div>
                  <div>Progress: {job.percent}%</div>
                  {startedLabel ? <div>Started: {startedLabel}</div> : null}
                  {finishedLabel ? (
                    <div>Finished: {finishedLabel}</div>
                  ) : running ? (
                    <div>Finished: in progress</div>
                  ) : null}
                </dl>
                <div className="mt-2 space-y-2">
                  <LinkResultList title={`Updated links (${updates.length})`} rows={updates} tone="ok" />
                  <LinkResultList
                    title={`Not updated (${unchanged.length})`}
                    rows={unchanged}
                    tone="muted"
                  />
                </div>
              </div>
              {failures.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-destructive">
                    <span>Failed videos ({failures.length})</span>
                    {!running ? (
                      <button
                        type="button"
                        onClick={() => void start('retry')}
                        className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                      >
                        Retry failed videos
                      </button>
                    ) : null}
                  </div>
                  <LinkResultList title="failed" rows={failures} tone="bad" bare />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {message && !dismissed ? (
        <p
          className={`max-w-3xl text-xs break-words ${
            isError ? 'text-destructive' : 'text-muted-foreground'
          }`}
          role={isError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}

export function RefreshVideoButton({
  submissionId,
  label,
  endpoint = ADMIN_ENDPOINT,
  initialError = null,
}: {
  submissionId: number
  label: string
  endpoint?: string
  initialError?: string | null
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState<'updated' | null>(null)
  const generation = useRef(0)
  const succeeded = useRef(false)

  useEffect(() => {
    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<{ id?: number; error?: string | null }>).detail
      if (detail?.id !== submissionId) return
      if (detail.error === null) {
        succeeded.current = true
        setFailed(false)
        setStatus('updated')
      }
    }
    window.addEventListener(SUBMISSION_VIEWS_EVENT, onUpdate)
    return () => window.removeEventListener(SUBMISSION_VIEWS_EVENT, onUpdate)
  }, [submissionId])

  async function run() {
    if (pending) return
    const my = ++generation.current
    setPending(true)
    setFailed(false)
    try {
      const data = await fetchChunkRetry(0, 1, { submissionId }, endpoint)
      if (my !== generation.current) return
      if (typeof data.views === 'number' && Number.isFinite(data.views)) {
        announceSubmissionViews(submissionId, data.views, { error: null })
        succeeded.current = true
        setFailed(false)
        setStatus('updated')
        return
      }
      if (data.checked > 0 && data.failed === 0) {
        succeeded.current = true
        setFailed(false)
        setStatus('updated')
        return
      }
      setFailed(true)
      setStatus(null)
    } catch {
      if (my !== generation.current) return
      setFailed(true)
      setStatus(null)
    } finally {
      if (my === generation.current) setPending(false)
    }
  }

  const hint = failed ? 'Refresh failed. Retry.' : label

  return (
    <div className="flex w-[4.5rem] flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        title={hint}
        aria-label={failed ? 'Retry refresh' : label}
        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
      </button>
      <span className="flex h-4 items-center text-[11px] leading-none">
        {failed ? (
          <span className="text-destructive">Retry</span>
        ) : status === 'updated' ? (
          <span className="text-emerald-700 dark:text-emerald-300">Updated</span>
        ) : (
          <span className="opacity-0">Updated</span>
        )}
      </span>
    </div>
  )
}
