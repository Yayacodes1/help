'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ChunkResult = {
  checked: number
  updated: number
  skipped: number
  failed: number
  nextOffset: number | null
}

export function RefreshViewsButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function runAllChunks() {
    setPending(true)
    setMessage(null)

    let offset = 0
    let checked = 0
    let updated = 0
    let skipped = 0
    let failed = 0

    try {
      for (;;) {
        setMessage(
          `Refreshing all videos… ${checked} checked so far (${updated} updated)`,
        )

        const res = await fetch('/api/admin/refresh-views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'all', limit: 30, offset }),
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

        if (data.nextOffset == null || data.checked === 0) break
        offset = data.nextOffset
      }

      setMessage(
        `All videos done — checked ${checked}: ${updated} updated, ${skipped} unchanged, ${failed} failed`,
      )
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void runAllChunks()}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
      >
        {pending ? 'Refreshing all…' : label}
      </button>
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
