'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/admin'

const initialState = { ok: false, message: '' } as { ok: boolean; message: string }

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-12 rounded-lg border border-input bg-background px-3.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-lg bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
      {state?.message ? (
        <p role="status" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
