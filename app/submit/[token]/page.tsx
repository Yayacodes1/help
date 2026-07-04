import { notFound } from 'next/navigation'
import { Send } from 'lucide-react'
import { SubmitForm } from '@/components/submit-form'
import { TodayVideos } from '@/components/today-videos'
import { DateSelect } from '@/components/date-select'
import { CreatorStats } from '@/components/creator-stats'
import {
  getCreatorByToken,
  getServerToday,
  getSubmissionsForCreatorOnDate,
  getCreatorCountsByPlatformOnDate,
  getCreatorStats,
  getCreatorDailyCounts,
} from '@/lib/queries'
import { PLATFORMS } from '@/lib/db'
import { goalFor } from '@/lib/platforms'
import { campaignRange, campaignDates } from '@/lib/campaign'

function isValidDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { token } = await params
  const { date: dateParam } = await searchParams
  const creator = await getCreatorByToken(token)
  if (!creator) notFound()

  const today = await getServerToday()
  const { start: campaignStart, end: campaignEnd } = campaignRange(today)
  const dates = campaignDates()

  // Default to today, but keep the selected date inside the campaign window.
  let date = isValidDate(dateParam) ? dateParam : today
  if (date < campaignStart) date = campaignStart
  if (date > campaignEnd) date = campaignEnd
  const isToday = date === today

  const [counts, submissions, stats, dailyCounts] = await Promise.all([
    getCreatorCountsByPlatformOnDate(creator.id, date),
    getSubmissionsForCreatorOnDate(creator.id, date),
    getCreatorStats(creator.id),
    getCreatorDailyCounts(creator.id),
  ])

  const activePlatforms = PLATFORMS.filter((p) => goalFor(creator, p) > 0)
  const platforms = activePlatforms.length > 0 ? activePlatforms : PLATFORMS

  const fields = platforms.map((platform) => ({
    platform,
    goal: goalFor(creator, platform),
    todayCount: counts[platform],
  }))

  return (
    <div className="min-h-dvh bg-background">
      <main
        dir="rtl"
        lang="ar"
        className="mx-auto flex w-full max-w-lg flex-col gap-7 px-5 py-8 text-right"
      >
        <header className="animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-border bg-gradient-to-bl from-primary to-[oklch(0.46_0.19_264)] p-6 text-primary-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-primary-foreground/80">مرحباً {creator.name}</p>
              <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight">
                تسليم فيديوهات نوتك
              </h1>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 text-lg font-bold backdrop-blur">
              نوتك
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-primary-foreground/90">أرسل فيديوهات اليوم</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">ملخص نشاطك</h2>
          <CreatorStats stats={stats} />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">اختر اليوم</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                يمكنك الرجوع لأي يوم من الحملة وإضافة فيديوهاتك.
              </p>
            </div>
            <DateSelect date={date} dates={dates} today={today} counts={dailyCounts} />
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
          <SubmitForm token={token} date={date} fields={fields} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">فيديوهات هذا اليوم</h2>
          <TodayVideos token={token} submissions={submissions} />
        </section>
      </main>
    </div>
  )
}
