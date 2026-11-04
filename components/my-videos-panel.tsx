'use client'

import { formatNumber } from '@/lib/format'

export type MyVideoRow = {
  id: number
  platform: string
  url: string
  video_date: string
  views: number
  project_name: string | null
}

export function MyVideosPanel({
  videos,
  labels,
}: {
  videos: MyVideoRow[]
  labels: {
    title: string
    hint: string
    empty: string
    open: string
    postedOn: string
    project: string
    viewsWord: string
  }
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">{labels.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.hint}</p>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {videos.map((v, i) => (
            <li
              key={v.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold tabular-nums">
                      #{i + 1}
                    </span>
                    <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {v.platform}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                  </div>
                </div>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-accent"
                >
                  {labels.open}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
