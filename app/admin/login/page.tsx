import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { LoginForm } from '@/components/login-form'

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect('/admin')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Admin login</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter your password to continue.</p>
      </header>
      <LoginForm />
    </main>
  )
}
