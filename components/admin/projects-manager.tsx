'use client'

import { useRef, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import type { Project } from '@/lib/db'
import { createProject, deleteProject } from '@/app/actions/admin'

export function ProjectsManager({ projects }: { projects: Project[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Projects</h2>

      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            await createProject(fd)
            formRef.current?.reset()
          })
        }
        className="mt-3 flex gap-2"
      >
        <input
          name="name"
          required
          placeholder="New project name"
          className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Add
        </button>
      </form>

      <ul className="mt-3 flex flex-col gap-1">
        {projects.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">No projects yet.</li>
        ) : (
          projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span>{p.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete project "${p.name}"? Creators and submissions will be unassigned.`))
                    startTransition(() => deleteProject(p.id))
                }}
                className="text-muted-foreground hover:text-destructive"
                title="Delete project"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
