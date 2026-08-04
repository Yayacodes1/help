'use client'

import { useState, useTransition } from 'react'
import { refreshRecentViews } from '@/app/actions/admin'

export function RefreshViewsButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null)
          startTransition(async () => {
            try {
              const r = await refreshRecentViews()
              setMessage(
                `Checked ${r.checked}: ${r.updated} updated, ${r.skipped} unchanged, ${r.failed} failed`,
              )
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Refresh failed')
            }
          })
        }}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
      >
        {pending ? 'Refreshing…' : label}
      </button>
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  )
}
