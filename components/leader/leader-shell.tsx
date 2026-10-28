'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logoutLeader } from '@/app/actions/leader'
import { LanguageToggle } from '@/components/language-toggle'
import { formatPlanCompare, type LeaderScore } from '@/lib/leader-score'
import { LEADER_TAB_ORDER, resolveLeaderTab, type LeaderTab } from '@/lib/leader-tabs'
import { createT, type Locale } from '@/lib/i18n'

export function LeaderShell({
  locale,
  leaderName,
  score,
  outreachHref,
  children,
}: {
  locale: Locale
  leaderName: string
  score: LeaderScore
  outreachHref?: string | null
  children: ReactNode
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const t = createT(locale)
  const compare = formatPlanCompare(score.todayPct, score.yesterdayPct, t('today'), t('leaderYesterday'))
  const onDashboard = pathname === '/leader'
  const activeTab: LeaderTab | 'upload' | null = pathname.startsWith('/leader/upload')
    ? 'upload'
    : onDashboard
      ? resolveLeaderTab(params.get('tab') ?? undefined, params.get('panel') ?? undefined)
      : null
  const labels: Record<LeaderTab | 'upload', string> = {
    today: t('tabToday'),
    analytics: t('tabAnalytics'),
    team: t('leaderTabTeam'),
    upload: t('leaderTabUpload'),
  }
  const tabs: Array<{ key: LeaderTab | 'upload'; href: string }> = [
    ...LEADER_TAB_ORDER.map((key) => ({ key, href: key === 'today' ? '/leader' : `/leader?tab=${key}` })),
    { key: 'upload', href: '/leader/upload' },
  ]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t('hey')} {leaderName}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{t('leaderDashboard')}</h1>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {t('leaderBatch')}: {compare}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {outreachHref ? (
              <Link
                href={outreachHref}
                className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
              >
                Outreach
              </Link>
            ) : null}
            <LanguageToggle locale={locale} labels={{ english: t('english'), arabic: t('arabic') }} />
            <form action={logoutLeader}>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
              >
                <LogOut className="size-4" />
                {t('logOut')}
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Sections">
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  activeTab === tab.key
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
