'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ChunkResult = {
  checked: number
  updated: number
  skipped: number
  failed: number
  nextOffset: number | null
  hasMore: boolean
  failures?: { reason: string; count: number }[]
}

function mergeFailures(
  into: Map<string, number>,
  list: { reason: string; count: number }[] | undefined,
) {
  if (!list) return
  for (const f of list) into.set(f.reason, (into.get(f.reason) ?? 0) + f.count)
}

export function RefreshViewsButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function runZeroChunks() {
    setPending(true)
    setMessage(null)

    let checked = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const failMap = new Map<string, number>()
    let emptyRounds = 0

    try {
      for (let round = 0; round < 80; round++) {
        setMessage(
          `Retrying 0-view videos… ${updated} updated, ${failed} failed so far`,
        )

        const res = await fetch('/api/admin/refresh-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'zeros', limit: 20 }),
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
        mergeFailures(failMap, data.failures)

        if (data.checked === 0) {
          emptyRounds += 1
          break
        }
        if (!data.hasMore) break
        if (data.updated === 0 && data.skipped === 0) {
          emptyRounds += 1
          if (emptyRounds >= 1) break
        } else {
          emptyRounds = 0
        }
      }

      const topFails = [...failMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${count}× ${reason}`)
        .join(' · ')

      setMessage(
        [
          `Zeros pass done — checked ${checked}: ${updated} updated, ${skipped} unchanged, ${failed} failed`,
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void runZeroChunks()}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        >
          {pending ? 'Retrying 0-view videos…' : label}
        </button>
      </div>
      {message ? (
        <p className="max-w-3xl text-xs text-muted-foreground break-words">
          {message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Retries only videos still at 0. Expands TikTok short links when possible.
        </p>
      )}
    </div>
  )
}
