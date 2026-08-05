'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { reclassifySubmissionPlatforms } from '@/app/actions/admin'
import type { RefreshViewsScope } from '@/lib/refresh-views'

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
    return `Server timed out (${status}). The host stopped the request before TikHub finished. Progress on videos already updated is kept — click the same button again to continue.`
  }
  if (status === 500) {
    return 'Server error (500). Check TIKHUB_API_KEY on Vercel or try again.'
  }
  return `Refresh failed (HTTP ${status}).`
}

async function fetchChunk(
  scope: RefreshViewsScope,
  offset: number,
  limit: number,
): Promise<ChunkResult> {
  const res = await fetch('/api/admin/refresh-views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, limit, offset }),
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
  allLabel,
}: {
  label: string
  allLabel: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [sampleFails, setSampleFails] = useState<
    { id: number; url: string; reason: string }[]
  >([])

  async function run(scope: RefreshViewsScope) {
    setPending(true)
    setMessage(null)
    setIsError(false)
    setSampleFails([])

    let checked = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    let platformsFixedInChunks = 0
    let offset = 0
    let timeouts = 0
    const failMap = new Map<string, number>()
    const samples: { id: number; url: string; reason: string }[] = []
    let platformLine = 'Platforms: skipped (will still fix from each URL while refreshing)'

    // Tiny chunks so Vercel does not 504 mid-batch.
    const limit = 5
    const maxRounds = scope === 'all' ? 400 : 200

    try {
      setMessage('Fixing platforms from URLs for all videos…')
      try {
        const reclass = await reclassifySubmissionPlatforms()
        platformLine = `Platforms: ${reclass.updated} fixed (→IG ${reclass.toInstagram}, →TT ${reclass.toTiktok}), ${reclass.skipped} already correct`
      } catch (e) {
        const why = e instanceof Error ? e.message : 'unknown error'
        platformLine = `Platforms: fix step failed (${why}). Continuing views refresh anyway — each video is still classified from its URL.`
        setIsError(true)
      }

      const verb = scope === 'all' ? 'Refreshing all views' : 'Retrying 0-view videos'

      for (let round = 0; round < maxRounds; round++) {
        setMessage(
          `${platformLine} · ${verb}… checked ${checked}, ${updated} updated, ${failed} failed` +
            (timeouts ? ` · recovered from ${timeouts} timeout(s)` : ''),
        )

        let data: ChunkResult
        try {
          data = await fetchChunk(scope, offset, limit)
        } catch (chunkErr) {
          const why =
            chunkErr instanceof Error ? chunkErr.message : 'chunk failed'
          const timedOut = /\b(502|503|504|timed out|timeout)\b/i.test(why)

          if (timedOut && timeouts < 8) {
            // Shrink further and keep going from the same offset.
            timeouts += 1
            setMessage(
              `${platformLine} · Timed out on a batch (host limit). Retrying smaller chunk from where we left off… (${timeouts})`,
            )
            await new Promise((r) => setTimeout(r, 800))
            try {
              data = await fetchChunk(scope, offset, 3)
            } catch (retryErr) {
              // Advance offset so one stuck batch cannot block forever.
              offset += limit
              timeouts += 1
              setMessage(
                `${platformLine} · Batch still timing out — skipped ahead to keep progressing. Last error: ${
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
        platformsFixedInChunks += data.platformsFixed ?? 0
        mergeFailures(failMap, data.failures)
        for (const s of data.failureSamples ?? []) {
          if (samples.length < 25) samples.push(s)
        }

        if (data.checked === 0) break
        if (!data.hasMore) break
        if (data.nextOffset == null) break
        offset = data.nextOffset
      }

      const topFails = [...failMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${count}× ${reason}`)
        .join(' · ')

      setSampleFails(samples)
      const summary = [
        `${platformLine}${platformsFixedInChunks ? ` (+${platformsFixedInChunks} during refresh)` : ''}`,
        `Views: checked ${checked}, ${updated} updated, ${skipped} unchanged, ${failed} failed`,
        timeouts ? `Host timeouts recovered: ${timeouts}` : null,
        topFails ? `Top fails: ${topFails}` : null,
        failed > 0
          ? 'Open any still-0 row — red text under Views is the reason for that video.'
          : null,
      ]
        .filter(Boolean)
        .join(' — ')

      setMessage(summary)
      setIsError(failed > 0 || timeouts > 0)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Refresh failed'
      setIsError(true)
      setMessage(
        [
          msg,
          updated || checked
            ? `Partial progress before stop: checked ${checked}, ${updated} updated, ${failed} failed. Click the same button again to continue.`
            : 'No videos were updated. Fix the error above, then try again.',
        ].join(' '),
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void run('all')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Refreshing views…' : allLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void run('zeros')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Working…' : label}
        </button>
      </div>
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
          Refresh all recounts every video (small batches so it won&apos;t time
          out). If something fails, you&apos;ll see a clear error here and under
          each video&apos;s Views.
        </p>
      )}
      {sampleFails.length > 0 && (
        <ul className="max-w-3xl space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-muted-foreground">
          <li className="font-medium text-destructive">
            Why some videos failed (fix these links or TikHub)
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
