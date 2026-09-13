'use client'

import { useRef, useState, useTransition } from 'react'
import { addCreatorSubmission } from '@/app/actions/admin'

export function AddCreatorVideoForm({
  creatorId,
  today,
}: {
  creatorId: number
  today: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
      action={(fd) => {
        setMessage(null)
        startTransition(async () => {
          const res = await addCreatorSubmission(creatorId, fd)
          if (!res.ok) {
            setMessage(res.message)
            return
          }
          formRef.current?.reset()
        })
      }}
    >
      <p className="text-xs font-semibold text-foreground">Add or replace with a new video</p>
      <p className="text-[11px] text-muted-foreground">
        Paste an Instagram or TikTok link. When TikHub can read the video, Posted uses the
        TikTok/IG publish date and time (and that day for the calendar date). Otherwise the
        date picker is used. To swap one video for another, use Replace on that row — or
        delete it and add here.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          name="url"
          required
          placeholder="https://…"
          className="h-10 min-w-[14rem] flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="date"
          name="video_date"
          defaultValue={today}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Add video
        </button>
      </div>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </form>
  )
}
