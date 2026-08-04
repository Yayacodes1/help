'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reclassifySubmissionPlatforms } from '@/app/actions/admin'

export function ReclassifyPlatformsButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null)
          startTransition(async () => {
            try {
              const r = await reclassifySubmissionPlatforms()
              setMessage(
                `Checked ${r.checked}: ${r.updated} fixed (→IG ${r.toInstagram}, →TT ${r.toTiktok}), ${r.skipped} already correct, ${r.unknown} unrecognized`,
              )
              router.refresh()
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Reclassify failed')
            }
          })
        }}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
      >
        {pending ? 'Fixing platforms…' : label}
      </button>
      {message ? (
        <p className="text-xs text-muted-foreground break-words">{message}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sets Instagram / TikTok from each link (repairs mis-pasted boxes).
        </p>
      )}
    </div>
  )
}
