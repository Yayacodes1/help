'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { TopVideoRow } from '@/lib/analytics'
import { formatNumber } from '@/lib/format'

export type VideoIdeaProjectOption = { id: number; name: string }

export function VideoIdeasPanel({
  videos,
  projects,
  lockedProjectId,
  labels,
}: {
  videos: TopVideoRow[]
  projects?: VideoIdeaProjectOption[]
  /** When set and only one project, picker is hidden. */
  lockedProjectId?: number | null
  labels: {
    title: string
    hint: string
    guideBox: string
    highlySuggested: string
    period30: string
    period60: string
    sortViews: string
    sortTrending: string
    sortViewsHint: string
    sortTrendingHint: string
    filterViewsLabel: string
    filterTrendLabel: string
    empty: string
    open: string
    username: string
    postedOn: string
    project: string
    allProjects: string
    pickProject: string
    topN: string
    viewsWord: string
    trendWord: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const period = params.get('ideasPeriod') === '60' ? '60' : '30'
  const limitRaw = Number(params.get('ideasLimit') ?? '10')
  const limit = [5, 10, 15, 20].includes(limitRaw) ? limitRaw : 10
  const sort = params.get('ideasSort') === 'trending' ? 'trending' : 'views'
  const showProjectPicker = (projects?.length ?? 0) > 1 && lockedProjectId == null
  const selectedProject =
    params.get('ideasProject') != null && Number.isFinite(Number(params.get('ideasProject')))
      ? Number(params.get('ideasProject'))
      : projects?.[0]?.id ?? null

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
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.hint}</p>
      </div>

      <div className="rounded-2xl border border-[#e8cfc0] bg-[#fff7f0] p-4 text-sm leading-relaxed text-[#5c2b24] dark:border-border dark:bg-card dark:text-foreground">
        {labels.guideBox.split('\n').map((line, i) =>
          line.trim() === '' ? (
            <div key={i} className="h-2" />
          ) : (
            <p key={i} className={i === 0 ? 'font-semibold' : undefined}>
              {line}
            </p>
          ),
        )}
      </div>

      {showProjectPicker ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.pickProject}
          <select
            value={selectedProject ?? ''}
            onChange={(e) =>
              push({ ideasProject: e.target.value ? e.target.value : null })
            }
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground"
          >
            {projects!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(['30', '60'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => push({ ideasPeriod: p === '30' ? null : p })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
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
                limit === n
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {labels.topN.replace('{n}', String(n))}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(['views', 'trending'] as const).map((s) => (
            <button
              key={s}
              type="button"
              title={s === 'views' ? labels.sortViewsHint : labels.sortTrendingHint}
              onClick={() => push({ ideasSort: s === 'views' ? null : s })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                sort === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {s === 'views' ? labels.filterViewsLabel : labels.filterTrendLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">
          {sort === 'trending' ? labels.filterTrendLabel : labels.filterViewsLabel}
        </p>
        <p className="mt-0.5">
          {sort === 'trending' ? labels.sortTrendingHint : labels.sortViewsHint}
        </p>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {videos.map((v, i) => {
            const highly = i < 5
            return (
              <li
                key={v.id}
                className={`overflow-hidden rounded-2xl border ${
                  highly
                    ? 'border-[#e8cfc0] bg-[#fff1e6] dark:border-border dark:bg-card'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold tabular-nums">
                        #{i + 1}
                      </span>
                      {highly ? (
                        <span className="rounded-md bg-[#9a0d18]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a0d18] dark:text-primary">
                          {labels.highlySuggested}
                        </span>
                      ) : null}
                      <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {v.platform}
                      </span>
                    </div>
                    <div className="mt-2 truncate text-base font-semibold">
                      @{v.creator_username || v.creator_name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {labels.postedOn}:{' '}
                        <span className="font-medium text-foreground tabular-nums">
                          {v.video_date}
                        </span>
                      </span>
                      {v.project_name ? (
                        <span>
                          {labels.project}:{' '}
                          <span className="font-medium text-foreground">{v.project_name}</span>
                        </span>
                      ) : null}
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatNumber(v.views)} {labels.viewsWord}
                      </span>
                      {sort === 'trending' && v.trend_score != null ? (
                        <span className="tabular-nums">
                          {labels.trendWord} {Math.round(v.trend_score)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
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
