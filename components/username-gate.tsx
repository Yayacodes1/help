'use client'

import { useActionState } from 'react'
import { AlertCircle, ArrowLeft, Music2 } from 'lucide-react'
import { startSubmission } from '@/app/actions/creator'

type State = { ok: boolean; message: string } | null

export function UsernameGate({ initialUsername = '' }: { initialUsername?: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(startSubmission, null)

  return (
    <div className="min-h-dvh bg-background">
      <main
        dir="rtl"
        lang="ar"
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-right"
      >
        <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-bl from-primary to-[oklch(0.46_0.19_264)] p-6 text-primary-foreground shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/15 text-lg font-bold backdrop-blur">
            نوتك
          </div>
          <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight">تسليم الفيديوهات</h1>
          <p className="mt-2 text-sm text-primary-foreground/90 text-pretty">
            أدخل اسم مستخدمك في تيك توك للمتابعة إلى نموذج التسليم.
          </p>
        </header>

        <form action={formAction} className="mt-6 flex flex-col gap-3">
          <label htmlFor="username" className="text-sm font-semibold text-foreground">
            اسم مستخدم تيك توك
          </label>
          <div className="relative">
            <Music2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <input
              id="username"
              name="username"
              required
              defaultValue={initialUsername}
              autoComplete="off"
              dir="ltr"
              placeholder="@username"
              className="h-12 w-full rounded-xl border border-input bg-card pr-10 pl-3 text-right text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {state && !state.ok && (
            <p
              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="status"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? '...' : 'متابعة'}
            <ArrowLeft className="h-4 w-4" />
          </button>
        </form>
      </main>
    </div>
  )
}
