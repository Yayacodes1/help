'use client'

import { useActionState, useState } from 'react'
import { AlertCircle, ArrowLeft, Lock, Music2, Users } from 'lucide-react'
import { startSubmission } from '@/app/actions/creator'
import { login } from '@/app/actions/admin'

type Role = 'creator' | 'admin'
type CreatorState = { ok: boolean; message: string } | null
type AdminState = { ok: boolean; message: string }

const adminInitial: AdminState = { ok: false, message: '' }

export function UnifiedLogin() {
  const [role, setRole] = useState<Role>('creator')
  const [creatorState, creatorAction, creatorPending] = useActionState<CreatorState, FormData>(
    startSubmission,
    null,
  )
  const [adminState, adminAction, adminPending] = useActionState(login, adminInitial)

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
          <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight">تسجيل دخول</h1>
          <p className="mt-2 text-sm text-primary-foreground/90 text-pretty">
            اختر نوع الحساب للمتابعة.
          </p>
        </header>

        <div className="mt-6 flex flex-col gap-3">
          <label htmlFor="role" className="text-sm font-semibold text-foreground">
            نوع الحساب
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-12 w-full rounded-xl border border-input bg-card px-3 text-right text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="creator">صانع المحتوى</option>
            <option value="admin">أدمن</option>
          </select>
        </div>

        {role === 'creator' ? (
          <form action={creatorAction} className="mt-5 flex flex-col gap-3">
            <label htmlFor="username" className="text-sm font-semibold text-foreground">
              أدخل اسم مستخدم تيك توك الخاص بك
            </label>
            <div className="relative">
              <Music2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <input
                id="username"
                name="username"
                required
                autoComplete="off"
                dir="ltr"
                placeholder="@username"
                className="h-12 w-full rounded-xl border border-input bg-card pr-10 pl-3 text-right text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
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
              {creatorPending ? '...' : 'متابعة'}
              <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form action={adminAction} className="mt-5 flex flex-col gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-foreground">
              كلمة المرور
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className="h-12 w-full rounded-xl border border-input bg-card pr-10 pl-3 text-right text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
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
              {adminPending ? '...' : 'دخول'}
              <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
