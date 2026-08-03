'use client'

import { useActionState } from 'react'
import { AlertCircle, ArrowLeft, Music2 } from 'lucide-react'
import { startSubmission } from '@/app/actions/creator'
import { LanguageToggle } from '@/components/language-toggle'
import { createT, type Locale } from '@/lib/i18n'

type State = { ok: boolean; message: string } | null

export function UsernameGate({
  initialUsername = '',
  locale,
}: {
  initialUsername?: string
  locale: Locale
}) {
  const t = createT(locale)
  const rtl = locale === 'ar'
  const [state, formAction, pending] = useActionState<State, FormData>(startSubmission, null)

  return (
    <div className="min-h-dvh bg-background">
      <main
        className={`mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 ${
          rtl ? 'text-right' : 'text-left'
        }`}
      >
        <div className={`mb-4 flex ${rtl ? 'justify-start' : 'justify-end'}`}>
          <LanguageToggle
            locale={locale}
            labels={{ english: t('english'), arabic: t('arabic') }}
          />
        </div>

        <header className="overflow-hidden rounded-2xl border border-[#e8cfc0] bg-[#fff1e6] p-6 text-[#9a0d18] shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#c41e2a] text-lg font-bold text-[#fff7f0]">
            نوتك
          </div>
          <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight text-[#9a0d18]">
            {t('gateTitle')}
          </h1>
          <p className="mt-2 text-sm text-[#a05a55] text-pretty">{t('gateSubtitle')}</p>
        </header>

        <form action={formAction} className="mt-6 flex flex-col gap-3">
          <label htmlFor="username" className="text-sm font-semibold text-foreground">
            {t('tiktokUsername')}
          </label>
          <div className="relative">
            <Music2
              className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-primary ${
                rtl ? 'right-3' : 'left-3'
              }`}
            />
            <input
              id="username"
              name="username"
              required
              defaultValue={initialUsername}
              autoComplete="off"
              dir="ltr"
              placeholder="@username"
              className={`h-12 w-full rounded-xl border border-input bg-card text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
                rtl ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3 text-left'
              }`}
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
            {pending ? '...' : t('continue')}
            <ArrowLeft className={`h-4 w-4 ${rtl ? '' : 'rotate-180'}`} />
          </button>
        </form>
      </main>
    </div>
  )
}
