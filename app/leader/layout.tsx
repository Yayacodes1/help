import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getLeaderSession } from '@/lib/leader-auth'
import { EMPTY_COUNTS, getLeaderBoard } from '@/lib/leaders'
import { getOperationalToday } from '@/lib/queries'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import { getLocale } from '@/lib/locale'
import { LeaderShell } from '@/components/leader/leader-shell'

export const dynamic = 'force-dynamic'

export default async function LeaderLayout({ children }: { children: ReactNode }) {
  const session = await getLeaderSession()
  if (!session) redirect('/login')
  await ensureCreatorTrackingColumns()
  const [day, locale] = await Promise.all([getOperationalToday(), getLocale()])
  const board = await getLeaderBoard(day)
  const score =
    board.leaders.find((row) => row.leaderId === session.id) ?? {
      leaderId: session.id,
      name: session.name,
      todayPct: null,
      yesterdayPct: null,
      today: EMPTY_COUNTS,
      yesterday: EMPTY_COUNTS,
      checks: 0,
      roster: 0,
      atRisk: 0,
      reposterId: null,
      reposterName: null,
      reposterHandle: null,
      reposterStatus: null,
      people: [],
    }

  return (
    <LeaderShell locale={locale} leaderName={session.name} day={day} score={score}>
      {children}
    </LeaderShell>
  )
}
