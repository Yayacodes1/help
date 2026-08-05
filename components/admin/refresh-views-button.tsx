'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Platform } from '@/lib/db'

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

function mergeFailures(
  into: Map<string, number>,
  list: { reason: string; count: number }[] | undefined,
) {
  if (!list) return
  for (const f of list) into.set(f.reason, (into.get(f.reason) ?? 0) + f.count)
}

function explainHttpError(status: number, apiError?: string): string {
  if (apiError?.trim()) return apiError.trim()
  if (status === 401) {
    return 'Not logged in as admin (401). Refresh the page and sign in again.'
  }
  if (status === 502 || status === 503 || status === 504) {
    return `Server timed out (${status}). Progress is kept — click Refresh again to continue.`
  }
  if (status === 500) {
    return 'Server error (500). Check TIKHUB_API_KEY on Vercel or try again.'
  }
  return `Refresh failed (HTTP ${status}).`
}

function readFilters(params: URLSearchParams, defaults: { from: string; to: string }) {
  const from = params.get('from') || defaults.from
  const to = params.get('to') || defaults.to
  const creatorRaw = params.get('creator')
  const projectRaw = params.get('project')
  const platformRaw = params.get('platform')
  const creatorId = creatorRaw ? Number(creatorRaw) : undefined
  const projectId = projectRaw ? Number(projectRaw) : undefined
  const platform =
    platformRaw === 'instagram' || platformRaw === 'tiktok'
      ? (platformRaw as Platform)
      : undefined

  return {
    from,
    to,
    creatorId: Number.isFinite(creatorId) ? creatorId : undefined,
    projectId: Number.isFinite(projectId) ? projectId : undefined,
    platform,
  }
}

async function fetchChunk(
  offset: number,
  limit: number,
  filters: ReturnType<typeof readFilters>,
): Promise<ChunkResult> {
  const res = await fetch('/api/admin/refresh-views', {
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

export function RefreshViewsButton({
  label,
  defaultFrom,
  defaultTo,
}: {
  label: string
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [sampleFails, setSampleFails] = useState<
    { id: number; url: string; reason: string }[]
  >([])

  async function run() {
    setPending(true)
    setMessage(null)
    setIsError(false)
    setSampleFails([])

    const filters = readFilters(searchParams, {
      from: defaultFrom,
      to: defaultTo,
    })

    let checked = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    let platformsFixed = 0
    let offset = 0
    let timeouts = 0
    const failMap = new Map<string, number>()
    const samples: { id: number; url: string; reason: string }[] = []
    const limit = 4
    const filterLine = `Dates ${filters.from} → ${filters.to}${
      filters.creatorId ? ` · creator #${filters.creatorId}` : ''
    }${filters.platform ? ` · ${filters.platform}` : ''}`

    try {
      for (let round = 0; round < 500; round++) {
        setMessage(
          `Refreshing views (${filterLine})… checked ${checked}, ${updated} updated, ${failed} failed` +
            (timeouts ? ` · ${timeouts} timeout(s) recovered` : ''),
        )

        let data: ChunkResult
        try {
          data = await fetchChunk(offset, limit, filters)
        } catch (chunkErr) {
          const why =
            chunkErr instanceof Error ? chunkErr.message : 'chunk failed'
          const timedOut = /\b(502|503|504|timed out|timeout)\b/i.test(why)

          if (timedOut && timeouts < 10) {
            timeouts += 1
            setMessage(
              `Timed out on a batch — retrying smaller chunk… (${timeouts})`,
            )
            await new Promise((r) => setTimeout(r, 700))
            try {
              data = await fetchChunk(offset, 2, filters)
            } catch (retryErr) {
              offset += limit
              setMessage(
                `Batch still timing out — skipped ahead. ${
                  retryErr instanceof Error ? retryErr.message : why
                }`,
              )
              continue
            }
          } else {
            throw chunkErr instanceof Error ? chunkErr : new Error(why)
          }
        }

        checked += data.checked
        updated += data.updated
        skipped += data.skipped
        failed += data.failed
        platformsFixed += data.platformsFixed ?? 0
        mergeFailures(failMap, data.failures)
        for (const s of data.failureSamples ?? []) {
          if (samples.length < 25) samples.push(s)
        }

        if (data.checked === 0) break
        if (!data.hasMore || data.nextOffset == null) break
        offset = data.nextOffset
      }

      const topFails = [...failMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${count}× ${reason}`)
        .join(' · ')

      setSampleFails(samples)
      setMessage(
        [
          `Done (${filterLine})`,
          `checked ${checked}: ${updated} updated, ${skipped} unchanged, ${failed} failed`,
          platformsFixed ? `${platformsFixed} platforms fixed from URLs` : null,
          timeouts ? `${timeouts} host timeout(s) recovered` : null,
          topFails ? `Top fails: ${topFails}` : null,
          failed > 0
            ? 'Red text under Views = reason for that video.'
            : null,
        ]
          .filter(Boolean)
          .join(' — '),
      )
      setIsError(failed > 0 || timeouts > 0)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Refresh failed'
      setIsError(true)
      setMessage(
        [
          msg,
          checked
            ? `Partial: checked ${checked}, ${updated} updated, ${failed} failed. Click Refresh again to continue.`
            : 'Nothing updated. Fix the error, then try again.',
        ].join(' '),
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
      >
        {pending ? 'Refreshing views…' : label}
      </button>
      {message ? (
        <p
          className={`max-w-3xl text-xs break-words ${
            isError ? 'text-destructive' : 'text-muted-foreground'
          }`}
          role={isError ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Uses the date / creator / platform filters above. Fixes IG↔TT from each
          URL, then pulls current views. A daily cron also refreshes today +
          yesterday once per day (Vercel Hobby limit).
        </p>
      )}
      {sampleFails.length > 0 && (
        <ul className="max-w-3xl space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          <li className="font-medium text-destructive">
            Why some videos failed
          </li>
          {sampleFails.map((s) => (
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
              {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
