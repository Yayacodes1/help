'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import type { Platform } from '@/lib/db'
import type { RoleFilter } from '@/lib/participant-role'
import { publicViewsError } from '@/lib/tikhub-views'

const ADMIN_ENDPOINT = '/api/admin/refresh-views'

type ChunkResult = {
  checked: number
  updated: number
  skipped: number
  failed: number
  platformsFixed?: number
  nextOffset: number | null
  hasMore: boolean
  failures?: { reason: string; count: number }[]
  failureSamples?: { id: number; url: string; reason: string }[]
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
  if (overrides.allDates || overrides.submissionId) {
    return {
      creatorId: overrides.creatorId,
      submissionId: overrides.submissionId,
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

type JobStatus = {
  id: number
  status: 'running' | 'completed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  remaining: number
  percent: number
  alreadyRunning?: boolean
  startedAt?: string
  finishedAt?: string | null
  failures: { id: number; url: string; reason: string }[]
}

function formatClock(value?: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString()
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
  defaultFrom,
  defaultTo,
  creatorId,
  allDates = false,
  endpoint = ADMIN_ENDPOINT,
  defaultRole = 'creator',
}: {
  label: string
  defaultFrom?: string
  defaultTo?: string
  creatorId?: number
  allDates?: boolean
  /** Leaders post to their own route, which only refreshes their team's videos. */
  endpoint?: string
  /** Role used when the URL has no `?role=` (admin: creators, leader: everyone). */
  defaultRole?: RoleFilter
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobEndpoint = `${endpoint.replace(/\/$/, '')}/job`
  const [job, setJob] = useState<JobStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const looping = useRef(false)
  const cancelled = useRef(false)
  const lastProcessed = useRef(0)

  useEffect(() => {
    cancelled.current = false
    void jobRequest(jobEndpoint, {}, 'GET')
      .then((latest) => {
        if (!cancelled.current && latest) setJob(latest)
      })
      .catch(() => undefined)
    return () => {
      cancelled.current = true
      looping.current = false
    }
  }, [jobEndpoint])

  async function drive(current: JobStatus) {
    if (looping.current) return
    looping.current = true
    lastProcessed.current = current.processed
    let next = current
    try {
      while (next.status === 'running') {
        if (cancelled.current) return
        next =
          (await jobRequest(jobEndpoint, { action: 'tick', jobId: next.id })) ?? next
        if (cancelled.current) return
        setJob(next)
        if (next.status !== 'running') break
        if (next.processed <= lastProcessed.current) {
          await new Promise((r) => setTimeout(r, 400))
        }
        lastProcessed.current = next.processed
      }
      setIsError(next.failed > 0)
      setMessage(
        next.total === 0
          ? 'No videos matched these filters.'
          : `Done — ${next.succeeded + next.skipped} saved, ${next.failed} failed, across ${next.total} videos on every page.`,
      )
      router.refresh()
    } catch (e) {
      if (cancelled.current) return
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      looping.current = false
    }
  }

  useEffect(() => {
    if (job?.status === 'running') void drive(job)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status === 'running'])

  async function start(action: 'start' | 'retry' = 'start') {
    setMessage(null)
    setIsError(false)
    const filters = readFilters(
      searchParams,
      { from: defaultFrom, to: defaultTo },
      { creatorId, allDates },
      defaultRole,
    )
    try {
      const started =
        action === 'retry' && job
          ? await jobRequest(jobEndpoint, { action: 'retry', jobId: job.id })
          : await jobRequest(jobEndpoint, { action: 'start', ...filters })
      if (!started) throw new Error('Could not start refresh.')
      setJob(started)
      if (started.alreadyRunning) {
        setMessage('A refresh is already running. Continuing that job across every page.')
      }
    } catch (e) {
      setIsError(true)
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
    }
  }

  const running = job?.status === 'running'
  const successful = job ? job.succeeded + job.skipped : 0
  const startedLabel = formatClock(job?.startedAt)
  const finishedLabel = formatClock(job?.finishedAt)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={running}
        onClick={() => void start('start')}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
      >
        {running ? 'Refreshing all views…' : label}
      </button>
      <p className="text-xs text-muted-foreground">
        {allDates || creatorId
          ? "Pulls current views for this person's videos on every page, not only the ones on screen."
          : 'Refreshes every video matching the filters above, across every page — not only this page.'}
      </p>
      {job && (running || job.processed > 0 || job.total > 0) ? (
        <div className="max-w-xl rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium">Refreshing all video views</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${job.percent}%` }}
            />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <div>Total videos: {job.total.toLocaleString()}</div>
            <div>Processed: {job.processed.toLocaleString()}</div>
            <div>Successfully refreshed: {successful.toLocaleString()}</div>
            <div>Failed: {job.failed.toLocaleString()}</div>
            <div>Remaining: {job.remaining.toLocaleString()}</div>
            <div>Progress: {job.percent}%</div>
            {startedLabel ? <div>Started: {startedLabel}</div> : null}
            {finishedLabel ? <div>Finished: {finishedLabel}</div> : running ? <div>Finished: in progress</div> : null}
          </dl>
        </div>
      ) : null}
      {message ? (
        <p
          className={`max-w-3xl text-xs break-words ${
            isError ? 'text-destructive' : 'text-muted-foreground'
          }`}
          role={isError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
      {job && job.failed > 0 && job.failures.length > 0 ? (
        <ul className="max-w-3xl space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          <li className="flex flex-wrap items-center justify-between gap-2 font-medium text-destructive">
            <span>Failed videos</span>
            {!running ? (
              <button
                type="button"
                onClick={() => void start('retry')}
                className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
              >
                Retry failed videos
              </button>
            ) : null}
          </li>
          {job.failures.map((s) => (
            <li key={`${s.id}-${s.reason}`} className="break-all">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                dir="ltr"
              >
                #{s.id}
              </a>
              {': '}
              {publicViewsError(s.reason)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function RefreshVideoButton({
  submissionId,
  label,
  endpoint = ADMIN_ENDPOINT,
}: {
  submissionId: number
  label: string
  endpoint?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function run() {
    setPending(true)
    setError(null)
    setStatus(null)
    try {
      const data = await fetchChunk(0, 1, { submissionId }, endpoint)
      if (data.failed > 0) {
        // Row already shows views_error after refresh — don't duplicate it here.
        setError(null)
        setStatus(null)
      } else if (data.checked === 0) {
        setError('Video not found for refresh.')
      } else if (data.updated > 0) {
        setStatus('Updated')
      } else {
        setStatus('Already current')
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        title={label}
        aria-label={label}
        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
      </button>
      {error ? (
        <span className="max-w-[160px] text-left text-[11px] leading-snug text-destructive">
          {error}
        </span>
      ) : status ? (
        <span className="max-w-[160px] text-left text-[11px] leading-snug text-emerald-700 dark:text-emerald-300">
          {status}
        </span>
      ) : null}
    </div>
  )
}
