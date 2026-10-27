import { CopyLink } from '@/components/copy-link'
import { formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import { projectToneClass } from '@/lib/project-scope'

export type GroupVideoRow = {
  id: number
  handle: string
  platform: 'instagram' | 'tiktok'
  url: string
  views: number
  projectName: string | null
}

export function GroupVideos({
  videos,
  emptyLabel,
}: {
  videos: GroupVideoRow[]
  emptyLabel: string
}) {
  if (videos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {videos.map((video) => {
        const meta = PLATFORM_META[video.platform]
        return (
          <li
            key={video.id}
            className="video-row flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <span className="min-w-0 flex-1 font-medium">@{video.handle}</span>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {meta.ar}
            </span>
            {video.projectName ? (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${projectToneClass(video.projectName)}`}
              >
                {video.projectName}
              </span>
            ) : null}
            <CopyLink url={video.url} />
            <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(video.views)}</span>
          </li>
        )
      })}
    </ul>
  )
}
