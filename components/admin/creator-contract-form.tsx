'use client'

import { useTransition } from 'react'
import type { Creator, Project } from '@/lib/db'
import { updateCreator } from '@/app/actions/admin'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function CreatorContractForm({
  creator,
  projects,
}: {
  creator: Creator & { project_name?: string | null }
  projects: Project[]
  today?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(fd) => startTransition(() => updateCreator(creator.id, fd))}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">Profile & fallback daily goals</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Prefer setting platforms and goals on each contract. Profile goals are only a fallback.
      </p>
      <div className="mt-3 grid gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Username
          <input name="name" required defaultValue={creator.name} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project
          <select name="project_id" defaultValue={creator.project_id ?? ''} className={inputClass}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Platforms
          <select
            name="platforms"
            defaultValue={creator.platforms || 'both'}
            className={inputClass}
          >
            <option value="both">Instagram + TikTok</option>
            <option value="tiktok">TikTok only</option>
            <option value="instagram">Instagram only</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Instagram / day (fallback)
            <input
              type="number"
              min={0}
              name="goal_instagram"
              defaultValue={creator.goal_instagram}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            TikTok / day (fallback)
            <input
              type="number"
              min={0}
              name="goal_tiktok"
              defaultValue={creator.goal_tiktok}
              className={inputClass}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Last paid (legacy)
            <input
              type="date"
              name="last_paid_at"
              defaultValue={creator.last_paid_at ?? ''}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Pay every (days)
            <input
              type="number"
              min={1}
              name="pay_every_days"
              defaultValue={creator.pay_every_days ?? 14}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes
          <textarea
            name="notes"
            rows={3}
            defaultValue={creator.notes ?? ''}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Warned, vacation, pause…"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </form>
  )
}
