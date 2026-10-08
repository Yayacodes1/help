'use client'

import { useActionState, useState } from 'react'
import { createLeader, deleteLeader, updateLeader } from '@/app/actions/leaders-admin'
import type { LeaderDirectory } from '@/lib/leaders'

const initial = { ok: false, message: '' }

const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function CreatorPicker({
  creators,
  selected,
  leaderId,
}: {
  creators: LeaderDirectory['creators']
  selected: number[]
  leaderId: number | null
}) {
  const chosen = new Set(selected)
  return (
    <div className="max-h-48 overflow-auto rounded-lg border border-border p-2">
      {creators.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">No creators yet.</p>
      ) : (
        creators.map((creator) => {
          const taken = creator.leaderId != null && creator.leaderId !== leaderId
          return (
            <label key={creator.id} className="flex items-center gap-2 px-1 py-1 text-sm">
              <input type="checkbox" name="creator_ids" value={creator.id} defaultChecked={chosen.has(creator.id)} />
              <span>
                {creator.name}
                {taken ? <span className="text-xs text-muted-foreground"> · moves off their current leader</span> : null}
              </span>
            </label>
          )
        })
      )}
    </div>
  )
}

function ReposterSelect({
  reposters,
  value,
}: {
  reposters: LeaderDirectory['reposters']
  value: number | null
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Linked reposter account
      <select name="reposter_id" defaultValue={value ?? ''} className={fieldClass}>
        <option value="">None</option>
        {reposters.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function LeadersManager({ directory }: { directory: LeaderDirectory }) {
  const [createState, createAction, createPending] = useActionState(createLeader, initial)
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Leader accounts</h3>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
        >
          {adding ? 'Close' : 'Add leader'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each leader has their own password. Assign the creators they are responsible for, and optionally the reposter
        account they post with.
      </p>
      {adding ? (
        <form action={createAction} className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name
              <input name="name" required className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Password
              <input name="password" type="text" required autoComplete="off" className={fieldClass} />
            </label>
          </div>
          <ReposterSelect reposters={directory.reposters} value={null} />
          <CreatorPicker creators={directory.creators} selected={[]} leaderId={null} />
          {createState.message ? <p className="text-sm text-destructive">{createState.message}</p> : null}
          <button
            type="submit"
            disabled={createPending}
            className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {createPending ? 'Saving…' : 'Create leader'}
          </button>
        </form>
      ) : null}
      <ul className="flex flex-col gap-3">
        {directory.leaders.map((leader) => (
          <li key={leader.id}>
            <LeaderEditor leader={leader} directory={directory} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeaderEditor({
  leader,
  directory,
}: {
  leader: LeaderDirectory['leaders'][number]
  directory: LeaderDirectory
}) {
  const [state, action, pending] = useActionState(updateLeader, initial)
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <input type="hidden" name="id" value={leader.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <input name="name" required defaultValue={leader.name} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          New password
          <input name="password" type="text" autoComplete="off" placeholder="Leave blank to keep" className={fieldClass} />
        </label>
      </div>
      <ReposterSelect reposters={directory.reposters} value={leader.reposterId} />
      <CreatorPicker creators={directory.creators} selected={leader.creatorIds} leaderId={leader.id} />
      {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="submit"
          formAction={deleteLeader}
          className="h-10 rounded-lg border border-border px-3 text-sm text-destructive"
          onClick={(event) => {
            if (!confirm(`Delete leader ${leader.name}? Their creators stay, unassigned.`)) event.preventDefault()
          }}
        >
          Delete
        </button>
      </div>
    </form>
  )
}
