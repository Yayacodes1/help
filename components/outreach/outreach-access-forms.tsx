'use client'

import { useActionState } from 'react'
import { addOutreachMember, type OutreachActionState } from '@/app/actions/outreach'

const initial: OutreachActionState = { ok: false, message: '' }

const field =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function OutreachAccessForms({
  leaders,
  reposters,
}: {
  leaders: { id: number; name: string }[]
  reposters: { id: number; name: string }[]
}) {
  const [state, action, pending] = useActionState(addOutreachMember, initial)

  return (
    <div className="flex flex-col gap-4">
      {state.message ? <p className="text-sm">{state.message}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Add upper management</h3>
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="role" value="upper" />
            <input type="hidden" name="mode" value="login" />
            <input name="name" placeholder="Name" className={field} />
            <input name="password" type="text" placeholder="Password" dir="ltr" className={field} />
            <button type="submit" disabled={pending} className="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              Add login
            </button>
          </form>
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="role" value="upper" />
            <input type="hidden" name="mode" value="leader" />
            <select name="leader_id" className={field} defaultValue="">
              <option value="">Attach a leader</option>
              {leaders.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending} className="h-10 rounded-lg border border-border text-sm font-medium disabled:opacity-60">
              Attach leader
            </button>
          </form>
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="role" value="upper" />
            <input type="hidden" name="mode" value="reposter" />
            <select name="creator_id" className={field} defaultValue="">
              <option value="">Attach a reposter</option>
              {reposters.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending} className="h-10 rounded-lg border border-border text-sm font-medium disabled:opacity-60">
              Attach reposter
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Add outreach</h3>
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="role" value="outreach" />
            <input type="hidden" name="mode" value="reposter" />
            <select name="creator_id" className={field} defaultValue="">
              <option value="">Existing reposter</option>
              {reposters.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={pending} className="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              Make them outreach
            </button>
          </form>
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="role" value="outreach" />
            <input type="hidden" name="mode" value="login" />
            <input name="name" placeholder="Name" className={field} />
            <input name="password" type="text" placeholder="Password" dir="ltr" className={field} />
            <button type="submit" disabled={pending} className="h-10 rounded-lg border border-border text-sm font-medium disabled:opacity-60">
              Add outreach-only login
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
