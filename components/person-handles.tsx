import { loginHandleFor } from '@/lib/usernames'

export type PersonHandles = {
  tiktok_username?: string | null
  instagram_username?: string | null
  login_platform?: string | null
  name?: string | null
}

export function PersonHandlesLine({
  person,
  className = 'text-xs text-muted-foreground',
}: {
  person: PersonHandles
  className?: string
}) {
  const parts: string[] = []
  const ig = person.instagram_username?.trim()
  const tt = person.tiktok_username?.trim()
  const login = loginHandleFor(person)
  if (ig) {
    const handle = ig.replace(/^@+/, '')
    parts.push(
      login.platform === 'instagram' && login.handle === handle
        ? `IG @${handle} (login)`
        : `IG @${handle}`,
    )
  }
  if (tt) {
    const handle = tt.replace(/^@+/, '')
    parts.push(
      login.platform === 'tiktok' && login.handle === handle
        ? `TT @${handle} (login)`
        : `TT @${handle}`,
    )
  }
  if (parts.length === 0) return null
  return <p className={className}>{parts.join(' · ')}</p>
}
