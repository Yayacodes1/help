'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { TopVideoRow } from '@/lib/analytics'
import { formatNumber } from '@/lib/format'

export function VideoIdeasPanel({
  videos,
  labels,
}: {
  videos: TopVideoRow[]
  labels: {
    title: string
    hint: string
    highlySuggested: string
    period30: string
    period60: string
    sortViews: string
    sortTrending: string
    empty: string
    open: string
    username: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const period = params.get('ideasPeriod') === '60' ? '60' : '30'
  const limitRaw = Number(params.get('ideasLimit') ?? '10')
  const limit = [5, 10, 15, 20].includes(limitRaw) ? limitRaw : 10
  const sort = params.get('ideasSort') === 'trending' ? 'trending' : 'views'

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('mode', 'ideas')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.hint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(['30', '60'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => push({ ideasPeriod: p === '30' ? null : p })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {p === '30' ? labels.period30 : labels.period60}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => push({ ideasLimit: n === 10 ? null : String(n) })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                limit === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              Top {n}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(['views', 'trending'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => push({ ideasSort: s === 'views' ? null : s })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                sort === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === 'views' ? labels.sortViews : labels.sortTrending}
            </button>
          ))}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {videos.map((v, i) => {
            const highly = i < 5
            return (
              <li
                key={v.id}
                className={`rounded-xl border p-3 ${
                  highly
                    ? 'border-[#e8cfc0] bg-[#fff1e6] dark:border-border dark:bg-card'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">#{i + 1}</div>
                    {highly ? (
                      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[#9a0d18] dark:text-primary">
                        {labels.highlySuggested}
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm font-semibold">
                      {labels.username}: @{v.creator_username || v.creator_name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground capitalize">
                      {v.platform} · {formatNumber(v.views)} views
                      {sort === 'trending' && v.trend_score != null
                        ? ` · trend ${Math.round(v.trend_score)}`
                        : ''}
                    </div>
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent"
                  >
                    {labels.open}
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
