import type { ReactNode } from 'react'
import {
  displayHandle,
  instagramProfileUrl,
  loginHandleFor,
  tiktokProfileUrl,
  type BrandSocialHandles,
} from '@/lib/usernames'

export type PersonHandles = BrandSocialHandles & {
  tiktok_username?: string | null
  instagram_username?: string | null
  login_platform?: string | null
  name?: string | null
}

function SocialLink({
  label,
  href,
  handle,
}: {
  label: string
  href: string | null
  handle: string | null
}) {
  if (!handle || !href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:underline"
    >
      {label} @{handle}
    </a>
  )
}

export function PersonHandlesLine({
  person,
  className = 'text-xs text-muted-foreground',
}: {
  person: PersonHandles
  className?: string
}) {
  const parts: ReactNode[] = []
  const ig = displayHandle(person.instagram_username)
  const tt = displayHandle(person.tiktok_username)
  const login = loginHandleFor(person)

  if (ig) {
    const href = instagramProfileUrl(ig)
    parts.push(
      <SocialLink
        key="login-ig"
        label={login.platform === 'instagram' && login.handle === ig ? 'IG (login)' : 'IG'}
        href={href}
        handle={ig}
      />,
    )
  }
  if (tt) {
    const href = tiktokProfileUrl(tt)
    parts.push(
      <SocialLink
        key="login-tt"
        label={login.platform === 'tiktok' && login.handle === tt ? 'TT (login)' : 'TT'}
        href={href}
        handle={tt}
      />,
    )
  }

  const notekIg = displayHandle(person.notek_instagram_username)
  const notekTt = displayHandle(person.notek_tiktok_username)
  const miqatIg = displayHandle(person.miqat_instagram_username)
  const miqatTt = displayHandle(person.miqat_tiktok_username)

  if (notekIg || notekTt) {
    const brand: ReactNode[] = []
    if (notekIg) {
      brand.push(
        <SocialLink
          key="notek-ig"
          label="Notek IG"
          href={instagramProfileUrl(notekIg)}
          handle={notekIg}
        />,
      )
    }
    if (notekTt) {
      brand.push(
        <SocialLink
          key="notek-tt"
          label="Notek TT"
          href={tiktokProfileUrl(notekTt)}
          handle={notekTt}
        />,
      )
    }
    parts.push(
      <span key="notek" className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
        {brand.map((node, i) => (
          <span key={i}>{node}</span>
        ))}
      </span>,
    )
  }

  if (miqatIg || miqatTt) {
    const brand: ReactNode[] = []
    if (miqatIg) {
      brand.push(
        <SocialLink
          key="miqat-ig"
          label="Miqat IG"
          href={instagramProfileUrl(miqatIg)}
          handle={miqatIg}
        />,
      )
    }
    if (miqatTt) {
      brand.push(
        <SocialLink
          key="miqat-tt"
          label="Miqat TT"
          href={tiktokProfileUrl(miqatTt)}
          handle={miqatTt}
        />,
      )
    }
    parts.push(
      <span key="miqat" className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
        {brand.map((node, i) => (
          <span key={i}>{node}</span>
        ))}
      </span>,
    )
  }

  if (parts.length === 0) return null
  return (
    <p className={`flex flex-wrap gap-x-2 gap-y-1 ${className}`}>
      {parts.map((node, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {node}
        </span>
      ))}
    </p>
  )
}

/** Form fields for Notek / Miqat brand accounts (same person). */
export function BrandHandleFields({
  notekTiktok,
  notekInstagram,
  miqatTiktok,
  miqatInstagram,
}: {
  notekTiktok?: string | null
  notekInstagram?: string | null
  miqatTiktok?: string | null
  miqatInstagram?: string | null
}) {
  const inputClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Brand accounts</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Same person — separate Notek and Miqat profiles so you can open their pages quickly.
          Login still uses the main TikTok / Instagram fields above.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notek TikTok
          <input
            name="notek_tiktok_username"
            defaultValue={notekTiktok ?? ''}
            placeholder="@notek_tiktok"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notek Instagram
          <input
            name="notek_instagram_username"
            defaultValue={notekInstagram ?? ''}
            placeholder="@notek_ig"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Miqat TikTok
          <input
            name="miqat_tiktok_username"
            defaultValue={miqatTiktok ?? ''}
            placeholder="@miqat_tiktok"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Miqat Instagram
          <input
            name="miqat_instagram_username"
            defaultValue={miqatInstagram ?? ''}
            placeholder="@miqat_ig"
            className={inputClass}
          />
        </label>
      </div>
    </div>
  )
}
