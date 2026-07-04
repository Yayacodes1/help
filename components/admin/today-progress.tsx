import Link from 'next/link'
import type { CreatorProgress } from '@/lib/queries'

function Cell({ today, goal }: { today: number; goal: number }) {
  if (goal <= 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const met = today >= goal
  return (
    <span
      className={`inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        met ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      {today}/{goal}
    </span>
  )
}

export function TodayProgress({ creators }: { creators: CreatorProgress[] }) {
  if (creators.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No creators yet. Add one below to start tracking daily goals.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Creator</th>
            <th className="px-4 py-3 text-center font-medium">Instagram</th>
            <th className="px-4 py-3 text-center font-medium">TikTok</th>
            <th className="px-4 py-3 text-right font-medium">Videos</th>
          </tr>
        </thead>
        <tbody>
          {creators.map((c) => {
            const goal = c.goal_instagram + c.goal_tiktok
            const today = c.today_instagram + c.today_tiktok
            const allMet =
              goal > 0 &&
              c.today_instagram >= c.goal_instagram &&
              c.today_tiktok >= c.goal_tiktok
            return (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/admin?creator=${c.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {c.name}
                  </Link>
                  {allMet && (
                    <span className="ml-2 text-xs font-medium text-primary">done</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Cell today={c.today_instagram} goal={c.goal_instagram} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Cell today={c.today_tiktok} goal={c.goal_tiktok} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {today} today · {c.total_videos} total
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
