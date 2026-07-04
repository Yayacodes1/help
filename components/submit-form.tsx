'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Music2, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { submitVideos } from '@/app/actions/creator'
import { PLATFORM_META } from '@/lib/platforms'
import type { Platform } from '@/lib/db'

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

export function SubmitForm({
  username,
  date,
  fields,
}: {
  username: string
  date: string
  fields: PlatformField[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const action = submitVideos.bind(null, username)
  const [state, formAction, pending] = useActionState<State, FormData>(action, null)

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state, router])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="video_date" value={date} />

      {fields.map(({ platform, goal, todayCount }) => {
        const meta = PLATFORM_META[platform]
        const met = goal > 0 && todayCount >= goal
        const Icon = PLATFORM_ICON[platform]
        return (
          <div
            key={platform}
            className="rounded-2xl border border-border bg-card p-4 text-right shadow-sm transition-shadow duration-300 focus-within:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="font-semibold text-card-foreground">{meta.ar}</p>
              </div>
              {goal > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                    met
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  {met && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {todayCount} / {goal}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{meta.hint_ar}</p>
            <textarea
              name={`${platform}_links`}
              rows={3}
              dir="ltr"
              placeholder="https://..."
              className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )
      })}

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

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
      >
        <Send className="h-4 w-4" />
        {pending ? '...' : 'إرسال'}
      </button>
    </form>
  )
}
