'use client'

import { useRouter } from 'next/navigation'
import { toggleReposterTask } from '@/app/actions/tasks'
import type { LeaderTask, TaskDaySummary } from '@/lib/task-types'

export function TaskBoard({
  username,
  day,
  today,
  tasks,
  checkedIds,
  calendar,
  labels,
}: {
  username: string
  day: string
  today: string
  tasks: LeaderTask[]
  checkedIds: number[]
  calendar: TaskDaySummary[]
  labels: {
    hint: string
    empty: string
    done: string
    previous: string
  }
}) {
  const router = useRouter()
  const checked = new Set(checkedIds)
  const active = tasks.filter(
    (t) => !t.archived_at && (t.pinned_at || t.created_on === day),
  )

  function openDay(next: string) {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    if (next === today) params.delete('taskDay')
    else params.set('taskDay', next)
    params.set('tab', params.get('tab') || 'today')
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.previous}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {calendar.map((d) => {
            const complete = d.total > 0 && d.done >= d.total
            const partial = d.done > 0 && !complete
            const selected = d.day === day
            return (
              <button
                key={d.day}
                type="button"
                title={`${d.day}: ${d.done}/${d.total}`}
                onClick={() => openDay(d.day)}
                className={`flex aspect-square flex-col items-center justify-center rounded-md text-[10px] font-medium tabular-nums ${
                  selected
                    ? 'ring-2 ring-primary'
                    : ''
                } ${
                  complete
                    ? 'bg-primary text-primary-foreground'
                    : partial
                      ? 'bg-amber-400/80 text-amber-950'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {d.day.slice(8, 10)}
              </button>
            )
          })}
        </div>
      </div>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((task) => {
            const on = checked.has(task.id)
            return (
              <li key={task.id}>
                <form action={toggleReposterTask}>
                  <input type="hidden" name="username" value={username} />
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="day" value={day} />
                  <input type="hidden" name="on" value={on ? '0' : '1'} />
                  <button
                    type="submit"
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm ${
                      on
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <span
                      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 font-medium">
                      {task.title}
                      {task.pinned_at ? (
                        <span className="ms-1 text-amber-500" aria-hidden>
                          ★
                        </span>
                      ) : null}
                    </span>
                    {on ? (
                      <span className="text-[11px] font-medium text-primary">{labels.done}</span>
                    ) : null}
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
