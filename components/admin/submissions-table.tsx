import Link from 'next/link'
import type { AdminSubmissionRow } from '@/lib/queries'
import { ViewsCell } from '@/components/admin/views-cell'
import { DeleteSubmission } from '@/components/admin/delete-submission'
import { formatDate, formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'

export function SubmissionsTable({
  submissions,
  emptyLabel = 'No videos match these filters.',
  showCreator = true,
  showProject = true,
  editableViews = true,
}: {
  submissions: AdminSubmissionRow[] | Array<{
    id: number
    creator_id?: number
    creator_name?: string
    project_name?: string | null
    video_date: string
    platform: 'instagram' | 'tiktok'
    url: string
    views: number
  }>
  emptyLabel?: string
  showCreator?: boolean
  showProject?: boolean
  editableViews?: boolean
}) {
  if (submissions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {showCreator && <th className="px-4 py-3 font-medium">Creator</th>}
            {showProject && <th className="px-4 py-3 font-medium">Project</th>}
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Platform</th>
            <th className="px-4 py-3 font-medium">Link</th>
            <th className="px-4 py-3 text-right font-medium">Views</th>
            {editableViews && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              {showCreator && (
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {'creator_id' in s && s.creator_id != null ? (
                    <Link
                      href={`/admin/creators/${s.creator_id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {s.creator_name}
                    </Link>
                  ) : (
                    s.creator_name ?? '—'
                  )}
                </td>
              )}
              {showProject && (
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {s.project_name ?? '—'}
                </td>
              )}
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatDate(s.video_date)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{PLATFORM_META[s.platform].en}</td>
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
              <td className="px-2 py-2 text-right">
                {editableViews ? (
                  <ViewsCell id={s.id} views={s.views ?? 0} />
                ) : (
                  <span className="px-2 tabular-nums">{formatNumber(s.views ?? 0)}</span>
                )}
              </td>
              {editableViews && (
                <td className="px-2 py-2 text-right">
                  <DeleteSubmission id={s.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
