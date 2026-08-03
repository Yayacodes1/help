'use client'

import { useTransition } from 'react'
import { setLocale } from '@/app/actions/locale'
import type { Locale } from '@/lib/i18n'

export function LanguageToggle({
  locale,
  labels,
}: {
  locale: Locale
  labels: { english: string; arabic: string }
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        disabled={pending || locale === 'en'}
        onClick={() => startTransition(() => setLocale('en'))}
        className={`rounded-md px-2.5 py-1.5 transition-colors ${
          locale === 'en'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {labels.english}
      </button>
      <button
        type="button"
        disabled={pending || locale === 'ar'}
        onClick={() => startTransition(() => setLocale('ar'))}
        className={`rounded-md px-2.5 py-1.5 transition-colors ${
          locale === 'ar'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {labels.arabic}
      </button>
    </div>
  )
}
