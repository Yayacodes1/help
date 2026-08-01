'use client'

import { useTransition } from 'react'
import type { Creator } from '@/lib/db'
import type { Project } from '@/lib/db'
import { markCreatorPaid, updateCreator } from '@/app/actions/admin'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function CreatorContractForm({
  creator,
  projects,
  today,
}: {
  creator: Creator & { project_name?: string | null }
  projects: Project[]
  today: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        action={(fd) => startTransition(() => updateCreator(creator.id, fd))}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Profile & goals</h2>
        <div className="mt-3 grid gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Username
            <input name="name" required defaultValue={creator.name} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Project
            <select
              name="project_id"
              defaultValue={creator.project_id ?? ''}
              className={inputClass}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Instagram / day
              <input
                type="number"
                min={0}
                name="goal_instagram"
                defaultValue={creator.goal_instagram}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              TikTok / day
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
              Last paid
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

      <form
        action={(fd) => startTransition(() => markCreatorPaid(creator.id, fd))}
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Mark paid</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sets last paid and rolls the next payday forward by the pay interval.
        </p>
        <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          Paid on
          <input type="date" name="paid_on" defaultValue={today} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground disabled:opacity-60"
        >
          Mark as paid
        </button>
      </form>
    </div>
  )
}
