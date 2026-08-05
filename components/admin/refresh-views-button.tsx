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
  const [sampleFails, setSampleFails] = useState<
    { id: number; url: string; reason: string }[]
  >([])

  async function run(scope: RefreshViewsScope) {
    setPending(true)
    setMessage(null)
    setSampleFails([])

    let checked = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    let platformsFixedInChunks = 0
    let offset = 0
    const failMap = new Map<string, number>()
    const samples: { id: number; url: string; reason: string }[] = []

    try {
      setMessage('Fixing platforms from URLs for all videos…')
      const reclass = await reclassifySubmissionPlatforms()
      const platformLine = `Platforms: ${reclass.updated} fixed (→IG ${reclass.toInstagram}, →TT ${reclass.toTiktok}), ${reclass.skipped} already correct`

      const verb = scope === 'all' ? 'Refreshing all views' : 'Retrying 0-view videos'
      const maxRounds = scope === 'all' ? 200 : 80

      for (let round = 0; round < maxRounds; round++) {
        setMessage(
          `${platformLine} · ${verb}… ${updated} updated, ${failed} failed so far`,
        )

        const res = await fetch('/api/admin/refresh-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            limit: 20,
            offset: scope === 'all' ? offset : undefined,
          }),
        })
        const data = (await res.json().catch(() => null)) as
          | (ChunkResult & { error?: string })
          | null

        if (!res.ok) {
          throw new Error(data?.error || `Refresh failed (${res.status})`)
        }
        if (!data) throw new Error('Empty response')

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

        if (scope === 'all') {
          if (data.nextOffset == null) break
          offset = data.nextOffset
        } else if (data.updated === 0 && data.skipped === 0) {
          break
        }
      }

      const topFails = [...failMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${count}× ${reason}`)
        .join(' · ')

      setSampleFails(samples)
      setMessage(
        [
          `${platformLine}${platformsFixedInChunks ? ` (+${platformsFixedInChunks} during refresh)` : ''}`,
          `Views: checked ${checked}, ${updated} updated, ${skipped} unchanged, ${failed} failed`,
          topFails ? `Top fails: ${topFails}` : null,
        ]
          .filter(Boolean)
          .join(' — '),
      )
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
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
        <p className="max-w-3xl text-xs text-muted-foreground break-words">
          {message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Refresh all recounts every video. Zeros only is cheaper. Failures are
          stored on each row so you can see why views are missing.
        </p>
      )}
      {sampleFails.length > 0 && (
        <ul className="max-w-3xl space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          <li className="font-medium text-foreground">Why some videos failed</li>
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
