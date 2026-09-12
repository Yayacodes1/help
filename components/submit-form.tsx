'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Clock, Lock, Music2, Send, CheckCircle2, AlertCircle, Link2 } from 'lucide-react'
import { submitVideos } from '@/app/actions/creator'
import { formatDateTime } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { Platform } from '@/lib/db'
import type { Locale } from '@/lib/i18n'

const PLATFORM_ICON: Record<Platform, typeof Camera> = {
  instagram: Camera,
  tiktok: Music2,
}

type PlatformField = {
  platform: Platform
  goal: number
  todayCount: number
}

type State = { ok: boolean; message: string } | null

type Labels = {
  pasteLinks: string
  pasteHint: string
  send: string
  sending: string
  project: string
  projectHint: string
  pickProject: string
  recordedAt: string
  recordedAtHint: string
}

function useServerClock(serverNowIso: string) {
  const [now, setNow] = useState(() => new Date(serverNowIso))

  useEffect(() => {
    const base = new Date(serverNowIso).getTime()
    if (Number.isNaN(base)) return
    const origin = Date.now()
    const tick = () => setNow(new Date(base + (Date.now() - origin)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [serverNowIso])

  return now
}

export function SubmitForm({
  username,
  fields,
  labels,
  projects,
  defaultProjectId,
  serverNow,
  locale,
}: {
  username: string
  fields: PlatformField[]
  labels: Labels
  projects: { id: number; name: string }[]
  defaultProjectId?: number | null
  serverNow: string
  locale: Locale
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const action = submitVideos.bind(null, username)
  const [state, formAction, pending] = useActionState<State, FormData>(action, null)
  const now = useServerClock(serverNow)

  useEffect(() => {
    if (state?.ok) {
      const select = formRef.current?.querySelector<HTMLSelectElement>('select[name="project_id"]')
      const keep = select?.value
      formRef.current?.reset()
      if (select && keep) select.value = keep
      router.refresh()
    }
  }, [state, router])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      {projects.length === 0 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No projects are set up yet. Ask admin to add Notek and Miqat.
        </p>
      ) : (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-foreground">{labels.project}</span>
        <span className="text-xs text-muted-foreground">{labels.projectHint}</span>
        <select
          name="project_id"
          required
          defaultValue={defaultProjectId ?? ''}
          className="mt-1 h-11 rounded-xl border border-border bg-card px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="" disabled>
            {labels.pickProject}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ platform, goal, todayCount }) => {
          const meta = PLATFORM_META[platform]
          const met = goal > 0 && todayCount >= goal
          const Icon = PLATFORM_ICON[platform]
          return (
            <div
              key={platform}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-right shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold text-card-foreground">{meta.ar}</p>
                </div>
                {goal > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                      met
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {met && <CheckCircle2 className="h-3 w-3" />}
                    {todayCount} / {goal}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 text-right shadow-sm transition-shadow duration-300 focus-within:shadow-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
            <Link2 className="h-5 w-5" />
          </span>
          <p className="font-semibold text-card-foreground">{labels.pasteLinks}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{labels.pasteHint}</p>
        <textarea
          name="links"
          rows={5}
          dir="ltr"
          placeholder={'https://www.instagram.com/reel/…\nhttps://vt.tiktok.com/…'}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {state && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
          role="status"
        >
          {state.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {state.message}
        </p>
      )}

      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>{labels.recordedAt}</span>
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-base font-semibold tabular-nums text-foreground">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <time dateTime={now.toISOString()}>{formatDateTime(now, locale)}</time>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{labels.recordedAtHint}</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  )
}
