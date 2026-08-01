import { Send } from 'lucide-react'
import { SubmitForm } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { DateSelect } from '@/components/date-select'
import { CreatorStats } from '@/components/creator-stats'
import { UsernameGate } from '@/components/username-gate'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import {
  getCreatorByName,
  getServerToday,
  getSubmissionsForCreatorOnDate,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getCreatorConsistency,
} from '@/lib/queries'
import { PLATFORMS } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { yearRange } from '@/lib/campaign'

export const dynamic = 'force-dynamic'

function isValidDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; date?: string }>
}) {
  const { u, date: dateParam } = await searchParams
  await ensureCreatorTrackingColumns()
  const creator = u ? await getCreatorByName(u) : null

  // No username yet, or an unknown username: show the public gate.
  if (!creator) {
    return <UsernameGate initialUsername={u ?? ''} />
  }

  const username = creator.name
  const today = await getServerToday()
  const { start: rangeStart, end: rangeEnd } = yearRange(today)

  // Default to today, clamped within the selectable range.
  let date = isValidDate(dateParam) ? dateParam : today
  if (date < rangeStart) date = rangeStart
  if (date > rangeEnd) date = rangeEnd
  const isToday = date === today

  const [counts, submissions, stats, consistency] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getCreatorStats(creator.id),
    getCreatorConsistency(creator, today),
  ])

  const activePlatforms = PLATFORMS.filter((p) => goalFor(creator, p) > 0)
  const platforms = activePlatforms.length > 0 ? activePlatforms : PLATFORMS

  const fields = platforms.map((platform) => ({
    platform,
    goal: goalFor(creator, platform),
    todayCount: counts[platform],
  }))

  const displayStats = {
    ...stats,
    current_streak: consistency.currentStreak,
    best_streak: consistency.bestStreak,
    hit_rate: consistency.hitRate,
  }

  return (
    <div className="min-h-dvh bg-background">
      <main
        dir="rtl"
        lang="ar"
        className="mx-auto flex w-full max-w-lg flex-col gap-7 px-5 py-8 text-right"
      >
        <header className="animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-[#e8cfc0] bg-[#fff1e6] p-6 text-[#9a0d18] shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#a05a55]">مرحباً {creator.name}</p>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight text-[#9a0d18]">
                تسليم فيديوهات نوتك
              </h1>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a] text-lg font-bold text-[#fff7f0]">
              نوتك
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[#b01020]">أرسل فيديوهات اليوم</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">ملخص نشاطك</h2>
          <CreatorStats stats={displayStats} />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">اختر اليوم</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                يمكنك اختيار أي يوم وإضافة فيديوهاتك.
              </p>
            </div>
            <DateSelect date={date} min={rangeStart} max={rangeEnd} />
          </div>
          {!isToday && (
            <p className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
              أنت تضيف فيديوهات لتاريخ سابق.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">أضف روابط الفيديوهات</h2>
          </div>
          <SubmitForm username={username} date={date} fields={fields} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">فيديوهات هذا اليوم</h2>
          <TodayVideos username={username} submissions={submissions} />
        </section>
      </main>
    </div>
  )
}
