'use client'

import { useState, useTransition } from 'react'
import { Pencil, Target } from 'lucide-react'
import { saveTeamGoal } from '@/app/actions/team-goals'
import type { TeamCount, TeamGoal, TeamRole } from '@/lib/team-goals'

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function shortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function GoalRow({
  projectId,
  role,
  have,
  goal,
  today,
}: {
  projectId: number
  role: TeamRole
  have: number
  goal: TeamGoal | undefined
  today: string
}) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const noun = role === 'creator' ? 'creators' : 'reposters'
  const target = goal?.target ?? 0
  const left = Math.max(0, target - have)
  const pct = target > 0 ? Math.min(100, Math.round((have / target) * 100)) : 0
  const daysLeft = goal?.by_date ? daysBetween(today, goal.by_date) : null

  let status: { text: string; tone: string }
  if (!goal) status = { text: 'No goal set yet', tone: 'text-muted-foreground' }
  else if (left === 0) status = { text: 'Goal reached ✓', tone: 'text-emerald-600 dark:text-emerald-400' }
  else if (daysLeft == null) status = { text: `Add ${left} more`, tone: 'text-amber-600 dark:text-amber-400' }
  else if (daysLeft < 0) {
    status = {
      text: `${left} short · deadline passed ${shortDate(goal.by_date!)}`,
      tone: 'text-red-600 dark:text-red-400',
    }
  } else {
    status = {
      text: `Add ${left} more by ${shortDate(goal.by_date!)} · ${daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`,
      tone: daysLeft <= 7 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium capitalize">{noun}</span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3" />
          {goal ? 'Edit goal' : 'Set goal'}
        </button>
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        {have}
        {goal ? <span className="text-base font-normal text-muted-foreground"> / {target}</span> : null}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{noun}</span>
      </p>
      {goal ? (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${left === 0 ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className={`text-xs font-medium ${status.tone}`}>{status.text}</p>

      {editing ? (
        <form
          action={(fd) =>
            startTransition(async () => {
              await saveTeamGoal(fd)
              setEditing(false)
            })
          }
          className="flex flex-wrap items-end gap-2 border-t border-border pt-2"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="role" value={role} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Goal ({noun})
            <input
              name="target"
              type="number"
              min={0}
              defaultValue={goal?.target ?? ''}
              placeholder={`e.g. ${have + 3}`}
              className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            By date
            <input
              name="by_date"
              type="date"
              min={today}
              defaultValue={goal?.by_date ?? ''}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <span className="w-full text-[11px] text-muted-foreground">Leave the goal empty to remove it.</span>
        </form>
      ) : null}
    </div>
  )
}

/** How many creators/reposters each project has vs. the goal, and how many to add by when. */
export function TeamGoalsBoard({
  counts,
  goals,
  today,
}: {
  counts: TeamCount[]
  goals: TeamGoal[]
  today: string
}) {
  const goalFor = (projectId: number, role: TeamRole) =>
    goals.find((g) => g.project_id === projectId && g.role === role)

  return (
    <section className="mt-6 flex flex-col gap-3">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
        <Target className="size-4 text-primary" />
        Team size
      </h2>
      <div className={`grid gap-4 ${counts.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {counts.map((c) => (
          <div
            key={c.projectId}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <h3 className="text-base font-semibold tracking-tight">{c.projectName}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <GoalRow
                projectId={c.projectId}
                role="creator"
                have={c.creators}
                goal={goalFor(c.projectId, 'creator')}
                today={today}
              />
              <GoalRow
                projectId={c.projectId}
                role="reposter"
                have={c.reposters}
                goal={goalFor(c.projectId, 'reposter')}
                today={today}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
