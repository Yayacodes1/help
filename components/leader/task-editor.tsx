'use client'

import { archiveLeaderTask, createLeaderTask, pinLeaderTask, updateLeaderTask } from '@/app/actions/tasks'
import type { LeaderTask } from '@/lib/task-types'

export function TaskEditor({
  tasks,
  labels,
}: {
  tasks: LeaderTask[]
  labels: {
    title: string
    hint: string
    add: string
    save: string
    remove: string
    empty: string
    placeholder: string
    pin: string
    unpin: string
    pinAdd: string
  }
}) {
  const active = tasks.filter((t) => !t.archived_at)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <form action={createLeaderTask} className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="title"
            required
            maxLength={200}
            placeholder={labels.placeholder}
            className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {labels.add}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="pin" value="1" className="size-4 accent-primary" />
          {labels.pinAdd}
        </label>
      </form>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
            >
              <form action={updateLeaderTask} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="task_id" value={task.id} />
                <input
                  name="title"
                  required
                  maxLength={200}
                  defaultValue={task.title}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
                >
                  {labels.save}
                </button>
              </form>
              <div className="flex items-center gap-2">
                <form action={pinLeaderTask}>
                  <input type="hidden" name="task_id" value={task.id} />
                  {task.pinned_at ? <input type="hidden" name="unpin" value="1" /> : null}
                  <button
                    type="submit"
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      task.pinned_at
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
                        : 'border border-border hover:bg-accent'
                    }`}
                  >
                    {task.pinned_at ? labels.unpin : labels.pin}
                  </button>
                </form>
                <form action={archiveLeaderTask}>
                  <input type="hidden" name="task_id" value={task.id} />
                  <button type="submit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
                    {labels.remove}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
