'use client'

import { useState, useTransition } from 'react'
import { Replace } from 'lucide-react'
import { replaceSubmissionUrl } from '@/app/actions/admin'

export function ReplaceSubmission({ id, currentUrl }: { id: number; currentUrl: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setUrl('')
          setMessage(null)
          setOpen(true)
        }}
        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60"
        title="Replace with a different video"
      >
        <Replace className="size-4" />
      </button>
    )
  }

  return (
    <div className="flex min-w-[14rem] max-w-xs flex-col gap-1.5 rounded-lg border border-border bg-card p-2">
      <p className="text-[11px] text-muted-foreground">Paste the new IG or TT link</p>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={currentUrl}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        autoFocus
      />
      {message ? <p className="text-[11px] text-destructive">{message}</p> : null}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={pending || !url.trim()}
          onClick={() => {
            const fd = new FormData()
            fd.set('url', url)
            startTransition(async () => {
              const res = await replaceSubmissionUrl(id, fd)
              if (!res.ok) {
                setMessage(res.message)
                return
              }
              setOpen(false)
            })
          }}
          className="h-8 flex-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          Replace
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="h-8 rounded-md border border-border px-2 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
