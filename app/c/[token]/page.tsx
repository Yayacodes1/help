import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCreatorByToken, getSubmissionsForCreator } from '@/lib/queries'
import { StatCard } from '@/components/stat-card'
import { formatDate, formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'

export default async function CreatorDashboard({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const creator = await getCreatorByToken(token)
  if (!creator) notFound()

  const submissions = await getSubmissionsForCreator(creator.id)

  const totalVideos = submissions.length
  const instagramPosts = submissions.filter((s) => s.platform === 'instagram').length
  const tiktokPosts = submissions.filter((s) => s.platform === 'tiktok').length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{creator.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your submissions</p>
        </div>
        <Link
          href={`/submit/${token}`}
          className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold leading-10 text-primary-foreground"
        >
          Submit video
        </Link>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Total videos" value={totalVideos} />
        <StatCard label="Instagram" value={instagramPosts} />
        <StatCard label="TikTok" value={tiktokPosts} />
      </section>

      <section className="mt-8">
        {submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No submissions yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 text-right font-medium">Views</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(s.video_date)}
                    </td>
                    <td className="px-4 py-3">{PLATFORM_META[s.platform].en}</td>
                    <td className="max-w-[220px] px-4 py-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium underline underline-offset-4"
                        dir="ltr"
                      >
                        {s.url}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatNumber(s.views ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
