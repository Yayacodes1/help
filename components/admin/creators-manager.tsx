'use client'

import { useRef, useState, useTransition } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import type { Project } from '@/lib/db'
import type { CreatorProgress } from '@/lib/queries'
import { createCreator, deleteCreator, updateCreator } from '@/app/actions/admin'

function GoalPill({
  label,
  today,
  goal,
}: {
  label: string
  today: number
  goal: number
}) {
  if (goal <= 0) return null
  const met = today >= goal
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        met ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      {label} {today}/{goal}
    </span>
  )
}

export function CreatorsManager({
  creators,
  projects,
}: {
  creators: CreatorProgress[]
  projects: Project[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const selectClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const goalInputClass =
    'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  function GoalInputs({
    ig = 0,
    tt = 0,
  }: {
    ig?: number
    tt?: number
  }) {
    return (
      <div className="grid w-full grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Instagram/day
          <input type="number" min={0} name="goal_instagram" defaultValue={ig} className={goalInputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          TikTok/day
          <input type="number" min={0} name="goal_tiktok" defaultValue={tt} className={goalInputClass} />
        </label>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Creators</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Creators submit at the shared <span className="font-medium">/submit</span> link using their
        TikTok username. Only usernames added here can submit.
      </p>

      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            await createCreator(fd)
            formRef.current?.reset()
          })
        }
        className="mt-3 flex flex-col gap-2"
      >
        <div className="flex flex-wrap gap-2">
          <input
            name="name"
            required
            placeholder="TikTok username"
            className="h-10 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select name="project_id" defaultValue="" className={selectClass}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <GoalInputs />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Add creator
        </button>
      </form>

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {creators.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">No creators yet.</li>
        ) : (
          creators.map((c) => (
            <li key={c.id} className="py-3">
              {editingId === c.id ? (
                <form
                  action={(fd) =>
                    startTransition(async () => {
                      await updateCreator(c.id, fd)
                      setEditingId(null)
                    })
                  }
                  className="flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      name="name"
                      required
                      defaultValue={c.name}
                      className="h-10 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <select name="project_id" defaultValue={c.project_id ?? ''} className={selectClass}>
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <GoalInputs ig={c.goal_instagram} tt={c.goal_tiktok} />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.project_name ?? 'No project'} · {c.total_videos} total
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(c.id)}
                        className="rounded-md border border-border p-1.5 hover:bg-accent"
                        title="Edit creator"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}" and all their submissions?`))
                            startTransition(() => deleteCreator(c.id))
                        }}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive"
                        title="Delete creator"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Today:</span>
                    <GoalPill label="IG" today={c.today_instagram} goal={c.goal_instagram} />
                    <GoalPill label="TT" today={c.today_tiktok} goal={c.goal_tiktok} />
                    {c.goal_instagram + c.goal_tiktok === 0 && (
                      <span className="text-xs text-muted-foreground">No goals set</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
