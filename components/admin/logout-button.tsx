import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/admin'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
      >
        <LogOut className="size-4" />
        Log out
      </button>
    </form>
  )
}
