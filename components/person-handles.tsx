export type PersonHandles = {
  tiktok_username?: string | null
  instagram_username?: string | null
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
  if (ig) parts.push(`IG @${ig.replace(/^@+/, '')}`)
  if (tt) parts.push(`TT @${tt.replace(/^@+/, '')}`)
  if (parts.length === 0) return null
  return <p className={className}>{parts.join(' · ')}</p>
}
