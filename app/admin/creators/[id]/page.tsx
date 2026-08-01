import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  getActiveContract,
  getAllProjects,
  getContractComparisons,
  getCreatorById,
  getCreatorConsistency,
  getCreatorStats,
  getPaySummary,
  getProjectById,
  getServerToday,
  getSubmissionsForCreator,
  contractWindow,
} from '@/lib/queries'
import { ConsistencyCalendar } from '@/components/admin/consistency-calendar'
import { CreatorContractForm } from '@/components/admin/creator-contract-form'
import { ContractsManager } from '@/components/admin/contracts-manager'
import { PanelBoard } from '@/components/admin/panel-board'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { StatCard } from '@/components/stat-card'
import { formatDate, formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function CreatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ panel?: string }>
}) {
  if (!(await isAdmin())) redirect('/login')
  await ensureCreatorTrackingColumns()

  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isFinite(id)) notFound()

  const creator = await getCreatorById(id)
  if (!creator) notFound()

  const sp = await searchParams
  const today = await getServerToday()
  const [projects, consistency, stats, submissions, comparisons, active] =
    await Promise.all([
      getAllProjects(),
      getCreatorConsistency(creator, today),
      getCreatorStats(creator.id),
      getSubmissionsForCreator(creator.id),
      getContractComparisons(creator, today),
      getActiveContract(creator.id, today),
    ])
  const project = creator.project_id ? await getProjectById(creator.project_id) : null
  const pay = await getPaySummary(creator, today)
  const window = contractWindow(creator, today, active)
  const totalViews = submissions.reduce((sum, s) => sum + (s.views ?? 0), 0)

  const defaultPanel =
    sp.panel && ['consistency', 'contracts', 'pay', 'videos'].includes(sp.panel)
      ? sp.panel
      : 'consistency'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Back to admin
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{creator.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project?.name ?? 'No project'}
            {active
              ? ` · ${active.name}: ${formatDate(active.start_date)}${
                  active.end_date ? ` → ${formatDate(active.end_date)}` : ' → open'
                }`
              : ` · No contract set · tracking ${formatDate(window.start)} → ${formatDate(window.end)}`}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current streak" value={`${consistency.currentStreak} days`} />
        <StatCard label="Best streak" value={`${consistency.bestStreak} days`} />
        <StatCard
          label="Hit rate"
          value={`${Math.round(consistency.hitRate * 100)}%`}
        />
        <StatCard
          label="Days hit"
          value={`${consistency.hitDays} / ${consistency.requiredDays}`}
        />
      </section>

      {creator.notes && (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">Notes: </span>
          {creator.notes}
        </p>
      )}

      <p className="mt-6 mb-3 text-xs text-muted-foreground">
        Tap a section to open it. Only one is open at a time.
      </p>

      <PanelBoard
        defaultOpen={defaultPanel}
        panels={[
          {
            id: 'consistency',
            title: 'Consistency',
            summary: `${Math.round(consistency.hitRate * 100)}% hit`,
            hint: active ? active.name : 'Current window',
            children: (
              <div>
                <ConsistencyCalendar days={consistency.days} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Missed {consistency.missDays} · Partial {consistency.partialDays} · Streak{' '}
                  {consistency.currentStreak} (best {consistency.bestStreak})
                </p>
              </div>
            ),
          },
          {
            id: 'contracts',
            title: 'Contracts',
            summary: comparisons.length === 0 ? 'None yet' : `${comparisons.length} periods`,
            hint: active ? active.name : 'Add a contract',
            children: (
              <ContractsManager
                creatorId={creator.id}
                today={today}
                comparisons={comparisons}
              />
            ),
          },
          {
            id: 'pay',
            title: 'Pay & profile',
            summary: pay.nextPayAt ? formatDate(pay.nextPayAt) : '—',
            hint: pay.isDue
              ? 'Pay due'
              : pay.lastPaidAt
                ? `Last ${formatDate(pay.lastPaidAt)}`
                : 'Set pay dates',
            children: (
              <CreatorContractForm creator={creator} projects={projects} today={today} />
            ),
          },
          {
            id: 'videos',
            title: 'Videos',
            summary: `${stats.total_videos}`,
            hint: `${formatNumber(totalViews)} views`,
            children: (
              <SubmissionsTable
                submissions={submissions.map((s) => ({
                  ...s,
                  creator_name: creator.name,
                  project_name: project?.name ?? null,
                }))}
                emptyLabel="No videos yet."
                showCreator={false}
                showProject={false}
                editableViews={false}
              />
            ),
          },
        ]}
      />
    </main>
  )
}
