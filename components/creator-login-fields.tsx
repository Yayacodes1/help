'use client'

import { useState } from 'react'
import { Camera, Music2 } from 'lucide-react'
import { createT, type Locale } from '@/lib/i18n'
import type { LoginPlatform } from '@/lib/usernames'

export function CreatorLoginFields({
  locale,
  defaultPlatform = 'tiktok',
  defaultUsername = '',
}: {
  locale: Locale
  defaultPlatform?: LoginPlatform
  defaultUsername?: string
}) {
  const t = createT(locale)
  const rtl = locale === 'ar'
  const [platform, setPlatform] = useState<LoginPlatform>(defaultPlatform)
  const Icon = platform === 'instagram' ? Camera : Music2

  return (
    <>
      <label htmlFor="login_platform" className="text-sm font-semibold text-foreground">
        {t('loginPlatform')}
      </label>
      <select
        id="login_platform"
        name="login_platform"
        value={platform}
        onChange={(e) => setPlatform(e.target.value as LoginPlatform)}
        className={`h-12 w-full rounded-xl border border-input bg-card px-3 text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
          rtl ? 'text-right' : 'text-left'
        }`}
      >
        <option value="tiktok">{t('tiktok')}</option>
        <option value="instagram">{t('instagram')}</option>
      </select>

      <label htmlFor="username" className="text-sm font-semibold text-foreground">
        {platform === 'instagram' ? t('instagramUsername') : t('tiktokUsername')}
      </label>
      <div className="relative">
        <Icon
          className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-primary ${
            rtl ? 'right-3' : 'left-3'
          }`}
        />
        <input
          id="username"
          name="username"
          required
          defaultValue={defaultUsername}
          autoComplete="off"
          dir="ltr"
          placeholder="@username"
          className={`h-12 w-full rounded-xl border border-input bg-card text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring ${
            rtl ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3 text-left'
          }`}
        />
      </div>
    </>
  )
}
