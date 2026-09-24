'use client'

import { useRef, useState, useTransition } from 'react'
import { addCreatorSubmission } from '@/app/actions/admin'

export function AddCreatorVideoForm({
  creatorId,
  today,
  projects = [],
  defaultProjectId,
  pickProjectLabel = 'Choose a project',
}: {
  creatorId: number
  today: string
  projects?: Array<{ id: number; name: string }>
  defaultProjectId?: number | null
  pickProjectLabel?: string
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
        Paste an Instagram or TikTok link and pick Miqat or Notek. When TikHub can read the
        video, Posted uses the publish date. Otherwise the date picker is used.
      </p>
      <div className="flex flex-wrap gap-2">
        {projects.length > 0 ? (
          <select
            name="project_id"
            required
            defaultValue={defaultProjectId ?? ''}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={pickProjectLabel}
          >
            <option value="" disabled>
              {pickProjectLabel}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
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
