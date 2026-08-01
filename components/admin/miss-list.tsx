import Link from 'next/link'
import type { MissRow } from '@/lib/queries'

export function MissList({
  misses,
  dayLabel,
}: {
  misses: MissRow[]
  dayLabel: string
}) {
  if (misses.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Everyone with goals hit their targets for {dayLabel}.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
      <h2 className="text-sm font-semibold tracking-tight text-[#9a0d18]">
        Needs attention · {dayLabel}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {misses.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/80 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <Link
                href={`/admin/creators/${m.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {m.name}
              </Link>
              <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                {m.reason}
              </span>
            </div>
            <div className="flex gap-2 text-xs tabular-nums text-muted-foreground">
              {m.goal_instagram > 0 && (
                <span>
                  IG {m.today_instagram}/{m.goal_instagram}
                </span>
              )}
              {m.goal_tiktok > 0 && (
                <span>
                  TT {m.today_tiktok}/{m.goal_tiktok}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
