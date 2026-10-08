'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logoutLeader } from '@/app/actions/leader'
import { CheckForm } from '@/components/leader/check-form'
import { LanguageToggle } from '@/components/language-toggle'
import { formatPlanCompare, type LeaderScore } from '@/lib/leaders'
import { createT, type Locale } from '@/lib/i18n'
import type { AttendanceStatus } from '@/lib/attendance-types'

function statusLabel(t: ReturnType<typeof createT>, status: AttendanceStatus): string {
  if (status === 'hit') return t('leaderPosted')
  if (status === 'partial') return t('leaderPartial')
  if (status === 'break') return t('leaderBreak')
  if (status === 'off') return t('leaderOff')
  return t('leaderMissed')
}

function statusClass(status: AttendanceStatus): string {
  if (status === 'hit') return 'bg-primary/15 text-primary'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  if (status === 'miss') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

export function LeaderShell({
  locale,
  leaderName,
  day,
  score,
  children,
}: {
  locale: Locale
  leaderName: string
  day: string
  score: LeaderScore
  children: ReactNode
}) {
  const pathname = usePathname()
  const activeMatch = pathname.match(/\/leader\/creators\/(\d+)/)
  const activeId = activeMatch ? Number(activeMatch[1]) : undefined
  const t = createT(locale)
  const rtl = locale === 'ar'
  const compare = formatPlanCompare(score.todayPct, score.yesterdayPct, t('today'), t('leaderYesterday'))

  return (
    <div className={`min-h-dvh bg-background ${rtl ? 'text-right' : 'text-left'}`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-4 py-6 lg:flex-row lg:px-6">
        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{leaderName}</p>
              <h1 className="text-lg font-semibold tracking-tight">{t('leaderTitle')}</h1>
            </div>
            <LanguageToggle locale={locale} labels={{ english: t('english'), arabic: t('arabic') }} />
          </div>
          <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm tabular-nums">{compare}</p>
          {score.reposterHandle ? (
            <Link
              href={`/submit?u=${encodeURIComponent(score.reposterHandle)}`}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('leaderReposterPost')}
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                @{score.reposterHandle}
                {score.reposterStatus === 'hit'
                  ? ` · ${t('leaderPosted')}`
                  : score.reposterStatus
                    ? ` · ${statusLabel(t, score.reposterStatus)}`
                    : ''}
              </span>
            </Link>
          ) : null}
          <nav className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-2">
            {score.people.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{t('leaderNoPeople')}</p>
            ) : (
              score.people.map((person) => {
                const active = person.id === activeId
                return (
                  <div
                    key={person.id}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${active ? 'bg-accent' : ''}`}
                  >
                    <CheckForm
                      creatorId={person.id}
                      day={day}
                      checked={person.checked}
                      note={person.note}
                      markLabel={t('leaderMark')}
                      undoLabel={t('leaderUndo')}
                      saveLabel={t('leaderSaveNote')}
                      notePlaceholder={t('leaderNotePh')}
                      compact
                    />
                    <Link href={`/leader/creators/${person.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{person.name}</span>
                      <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium ${statusClass(person.status)}`}>
                        {statusLabel(t, person.status)}
                      </span>
                    </Link>
                  </div>
                )
              })
            )}
          </nav>
          <form action={logoutLeader}>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
            >
              <LogOut className="size-4" />
              {t('logOut')}
            </button>
          </form>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
