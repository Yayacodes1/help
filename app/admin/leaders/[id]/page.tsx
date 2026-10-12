import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { getCreatorById, getCreatorConsistency, getCreatorStats, getOperationalToday, getServerToday } from '@/lib/queries'
import { getLeaderBoard, getLeaderProfile } from '@/lib/leaders'
import { LEADER_LEVEL_LABELS } from '@/lib/leader-score'
import { getTeamMembers } from '@/lib/leader-portal'
import { getActivityRange } from '@/lib/activity'
import { emptyActivityCounts } from '@/lib/activity-kinds'
import { addDays } from '@/lib/campaign'
import { eachDate } from '@/lib/consistency'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { adminDashboardHref, adminPersonHref } from '@/lib/admin-href'
import { ConsistencyCalendar } from '@/components/admin/consistency-calendar'
import { ActivityCountsLine } from '@/components/activity-toggles'
import { StatCard } from '@/components/stat-card'
import type { AttendanceStatus } from '@/lib/attendance-types'

export const dynamic = 'force-dynamic'

const CHECK_DAYS = 14
const ACTIVITY_DAYS = 30

function statusWord(status: AttendanceStatus | undefined): string {
  if (status === 'hit') return 'Posted'
  if (status === 'partial') return 'Partial'
  if (status === 'break') return 'Break'
  if (status === 'off') return 'Off'
  if (status === 'miss') return "Didn't post"
  return '—'
}

export default async function LeaderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/login')
  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isFinite(id)) notFound()

  const [today, opToday] = await Promise.all([getServerToday(), getOperationalToday()])
  const checkFrom = addDays(opToday, -(CHECK_DAYS - 1))
  const activityFrom = addDays(today, -(ACTIVITY_DAYS - 1))

  const profile = await getLeaderProfile(id, checkFrom, opToday)
  if (!profile) notFound()

  const activityIds = profile.reposterId != null ? [...profile.teamIds, profile.reposterId] : profile.teamIds
  const [board, members, activity, ownCreator] = await Promise.all([
    getLeaderBoard(opToday),
    getTeamMembers(profile.teamIds, today),
    getActivityRange(activityIds, activityFrom, today),
    profile.reposterId != null ? getCreatorById(profile.reposterId) : Promise.resolve(null),
  ])
  const [ownConsistency, ownStats] = ownCreator
    ? await Promise.all([getCreatorConsistency(ownCreator, today), getCreatorStats(ownCreator.id)])
    : [null, null]

  const score = board.leaders.find((row) => row.leaderId === id) ?? null
  const statusById = new Map((score?.people ?? []).map((p) => [p.id, p.status]))
  const roster = profile.teamIds.length
  const checkDays = eachDate(checkFrom, opToday)
  const daysChecked = checkDays.filter((day) => (profile.checksByDay[day] ?? 0) > 0).length
  const teamHit =
    members.length > 0 ? Math.round((members.reduce((sum, m) => sum + m.hitRate, 0) / members.length) * 100) : null
  const ownActivity = profile.reposterId != null ? activity.get(profile.reposterId) : undefined
  const { pay } = profile

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-5 py-8">
      <header>
        <Link
          href={adminDashboardHref({ panel: 'leaders' })}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Leaders
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          {profile.name}
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {LEADER_LEVEL_LABELS[pay.level]}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pay.monthlyPay != null ? `${formatMoney(pay.monthlyPay, pay.payCurrency)} / month` : 'Pay not set'}
          {pay.levelSince ? ` · ${LEADER_LEVEL_LABELS[pay.level]} since ${formatDate(pay.levelSince)}` : ''}
          {profile.reposterName ? ` · posts as ${profile.reposterName}` : ''}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Team" value={roster} hint={`${score?.atRisk ?? 0} near a strike`} />
        <StatCard
          label="Team on plan today"
          value={score?.todayPct == null ? '–' : `${score.todayPct}%`}
          hint={score?.yesterdayPct == null ? undefined : `${score.yesterdayPct}% yesterday`}
        />
        <StatCard
          label="Days they checked the team"
          value={`${daysChecked}/${CHECK_DAYS}`}
          hint={`${score?.checks ?? 0}/${roster} checked today`}
        />
        <StatCard label="Team hit rate" value={teamHit == null ? '–' : `${teamHit}%`} hint="Average over contracts" />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Daily checks · last {CHECK_DAYS} days</h2>
        <p className="text-xs text-muted-foreground">How many of their people they checked each day.</p>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
          {checkDays.map((day) => {
            const n = profile.checksByDay[day] ?? 0
            const full = roster > 0 && n >= roster
            return (
              <div
                key={day}
                title={formatDate(day)}
                className={`flex flex-col items-center rounded-md px-1 py-1.5 text-[11px] tabular-nums ${
                  full
                    ? 'bg-emerald-500/90 text-white'
                    : n > 0
                      ? 'bg-amber-400/90 text-amber-950'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                <span>{day.slice(8)}</span>
                <span className="font-semibold">
                  {n}/{roster}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Their own posting</h2>
        {ownCreator && ownConsistency && ownStats ? (
          <>
            <p className="text-sm text-muted-foreground">
              <Link href={adminPersonHref(ownCreator.id)} className="font-medium text-foreground underline-offset-4 hover:underline">
                {ownCreator.name}
              </Link>{' '}
              · {Math.round(ownConsistency.hitRate * 100)}% hit · streak {ownConsistency.currentStreak} (best{' '}
              {ownConsistency.bestStreak}) · IG {ownStats.instagram_videos} · TT {ownStats.tiktok_videos} videos
            </p>
            <p className="text-xs text-muted-foreground">
              Last {ACTIVITY_DAYS} days also did:{' '}
              <ActivityCountsLine counts={ownActivity?.counts ?? emptyActivityCounts()} className="" />
            </p>
            <ConsistencyCalendar days={ownConsistency.days} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No posting account linked. Link their reposter account in the Leaders panel to track their own content.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Team</h2>
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No one assigned yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Today</th>
                  <th className="px-3 py-2 text-right font-medium">Hit rate</th>
                  <th className="px-3 py-2 text-right font-medium">Streak</th>
                  <th className="px-3 py-2 text-right font-medium">Month</th>
                  <th className="px-3 py-2 font-medium">Also did · {ACTIVITY_DAYS}d</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.person.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={adminPersonHref(m.person.id, { role: m.person.role })}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {m.person.name}
                      </Link>
                      <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {m.person.role}
                      </span>
                    </td>
                    <td className="px-3 py-2">{statusWord(statusById.get(m.person.id))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(m.hitRate * 100)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.currentStreak}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {m.monthVideos} videos · {formatNumber(m.monthViews)} views
                    </td>
                    <td className="px-3 py-2">
                      <ActivityCountsLine counts={activity.get(m.person.id)?.counts ?? emptyActivityCounts()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Notes they left · last {CHECK_DAYS} days</h2>
        {profile.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {profile.notes.map((n) => (
              <li key={`${n.day}-${n.creatorId}`} className="px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {formatDate(n.day)} · {n.creatorName}:
                </span>{' '}
                {n.note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
