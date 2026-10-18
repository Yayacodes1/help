'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LanguageToggle } from '@/components/language-toggle'
import { createT, type Locale } from '@/lib/i18n'
import { REPOSTER_TAB_ORDER, resolveReposterTab, type ReposterTab } from '@/lib/reposter-tabs'

export function ReposterShell({
  locale,
  username,
  displayName,
  squadName,
  children,
}: {
  locale: Locale
  username: string
  displayName: string
  squadName: string | null
  children: ReactNode
}) {
  const params = useSearchParams()
  const t = createT(locale)
  const active = resolveReposterTab(params.get('tab') ?? undefined, params.get('panel') ?? undefined)
  const u = encodeURIComponent(username)
  const labels: Record<ReposterTab, string> = {
    today: t('tabToday'),
    analytics: t('tabAnalytics'),
    team: t('leaderTabTeam'),
    upload: t('leaderTabUpload'),
  }
  const tabs: Array<{ key: ReposterTab; href: string }> = [
    { key: 'today', href: `/submit?u=${u}` },
    { key: 'analytics', href: `/submit?u=${u}&tab=analytics` },
    { key: 'team', href: `/submit?u=${u}&tab=team` },
    { key: 'upload', href: `/submit?u=${u}&tab=upload` },
  ]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t('hey')} @{displayName}
              {squadName ? ` · ${squadName}` : ''}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{t('reposterDashboard')}</h1>
          </div>
          <LanguageToggle locale={locale} labels={{ english: t('english'), arabic: t('arabic') }} />
        </div>
        <nav aria-label="Sections">
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active === tab.key ? 'page' : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  active === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {labels[tab.key]}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      {children}
    </main>
  )
}
