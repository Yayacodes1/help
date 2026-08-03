'use client'

import { useActionState, useState } from 'react'
import { AlertCircle, ArrowLeft, Lock, Music2, Users } from 'lucide-react'
import { startSubmission } from '@/app/actions/creator'
import { login } from '@/app/actions/admin'
import { LanguageToggle } from '@/components/language-toggle'
import { createT, type Locale } from '@/lib/i18n'

type Role = 'creator' | 'admin'
type CreatorState = { ok: boolean; message: string } | null
type AdminState = { ok: boolean; message: string }

const adminInitial: AdminState = { ok: false, message: '' }

export function UnifiedLogin({ locale }: { locale: Locale }) {
  const t = createT(locale)
  const rtl = locale === 'ar'
  const [role, setRole] = useState<Role>('creator')
  const [creatorState, creatorAction, creatorPending] = useActionState<CreatorState, FormData>(
    startSubmission,
    null,
  )
  const [adminState, adminAction, adminPending] = useActionState(login, adminInitial)

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
            {t('loginTitle')}
          </h1>
          <p className="mt-2 text-sm text-[#a05a55] text-pretty">{t('loginSubtitle')}</p>
        </header>

        <div className="mt-6 flex flex-col gap-3">
          <label htmlFor="role" className="text-sm font-semibold text-foreground">
            {t('accountType')}
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={`h-12 w-full rounded-xl border border-input bg-card px-3 text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
              rtl ? 'text-right' : 'text-left'
            }`}
          >
            <option value="creator">{t('creatorRole')}</option>
            <option value="admin">{t('adminRole')}</option>
          </select>
        </div>

        {role === 'creator' ? (
          <form action={creatorAction} className="mt-5 flex flex-col gap-3">
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
                autoComplete="off"
                dir="ltr"
                placeholder="@username"
                className={`h-12 w-full rounded-xl border border-input bg-card text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
                  rtl ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3 text-left'
                }`}
              />
            </div>

            {creatorState && !creatorState.ok && (
              <p
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="status"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {creatorState.message}
              </p>
            )}

            <button
              type="submit"
              disabled={creatorPending}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
            >
              <Users className="h-4 w-4" />
              {creatorPending ? '...' : t('continue')}
              <ArrowLeft className={`h-4 w-4 ${rtl ? '' : 'rotate-180'}`} />
            </button>
          </form>
        ) : (
          <form action={adminAction} className="mt-5 flex flex-col gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-foreground">
              {t('password')}
            </label>
            <div className="relative">
              <Lock
                className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-primary ${
                  rtl ? 'right-3' : 'left-3'
                }`}
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className={`h-12 w-full rounded-xl border border-input bg-card text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
                  rtl ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3 text-left'
                }`}
              />
            </div>

            {adminState?.message && (
              <p
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="status"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {adminState.message}
              </p>
            )}

            <button
              type="submit"
              disabled={adminPending}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              {adminPending ? '...' : t('continue')}
              <ArrowLeft className={`h-4 w-4 ${rtl ? '' : 'rotate-180'}`} />
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
