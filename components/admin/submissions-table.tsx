import Link from 'next/link'
import type { AdminSubmissionRow } from '@/lib/queries'
import { ViewsCell } from '@/components/admin/views-cell'
import { RefreshVideoButton } from '@/components/admin/refresh-views-button'
import { ProjectCell } from '@/components/admin/project-cell'
import { DeleteSubmission } from '@/components/admin/delete-submission'
import { ReplaceSubmission } from '@/components/admin/replace-submission'
import { CopyLink } from '@/components/copy-link'
import { formatDateTime, formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import { adminPersonHref } from '@/lib/admin-href'
import type { Project } from '@/lib/db'

export function SubmissionsTable({
  submissions,
  emptyLabel = 'No videos match these filters.',
  showCreator = true,
  showProject = true,
  editableViews = true,
  allowManageVideos = false,
  editableProject = false,
  projects = [],
  noProjectLabel = 'No project',
  linkRole,
  projectId,
  linkFrom,
  refreshLabel = 'Refresh this video',
}: {
  submissions: AdminSubmissionRow[] | Array<{
    id: number
    creator_id?: number
    creator_name?: string
    project_id?: number | null
    project_name?: string | null
    video_date: string
    created_at?: string | null
    platform_posted_at?: string | null
    platform: 'instagram' | 'tiktok'
    url: string
    views: number
    views_error?: string | null
    batch_index?: number | null
  }>
  emptyLabel?: string
  showCreator?: boolean
  showProject?: boolean
  editableViews?: boolean
  /** Show replace + delete even when views are read-only. */
  allowManageVideos?: boolean
  editableProject?: boolean
  projects?: Pick<Project, 'id' | 'name'>[]
  noProjectLabel?: string
  linkRole?: string | null
  projectId?: number | string | null
  linkFrom?: string | null
  refreshLabel?: string
}) {
  const manageVideos = allowManageVideos || editableViews
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
            <th className="px-4 py-3 font-medium">Posted</th>
            <th className="px-4 py-3 font-medium">Platform</th>
            <th className="px-4 py-3 font-medium">Link</th>
            <th className="px-4 py-3 text-right font-medium">Views</th>
            {manageVideos && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => {
            const err =
              'views_error' in s && typeof s.views_error === 'string' && s.views_error
                ? s.views_error
                : null
            return (
              <tr key={s.id} className="border-b border-border last:border-0">
                {showCreator && (
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {'creator_id' in s && s.creator_id != null ? (
                      <Link
                        href={adminPersonHref(s.creator_id, {
                          role: linkRole,
                          projectId,
                          from: linkFrom,
                        })}
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
                    {editableProject && projects.length > 0 ? (
                      <ProjectCell
                        id={s.id}
                        projectId={'project_id' in s ? (s.project_id ?? null) : null}
                        projects={projects}
                        noneLabel={noProjectLabel}
                      />
                    ) : (
                      s.project_name ?? '—'
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  <time
                    dateTime={
                      ('platform_posted_at' in s && s.platform_posted_at
                        ? String(s.platform_posted_at)
                        : null) ??
                      ('created_at' in s && s.created_at
                        ? String(s.created_at)
                        : s.video_date)
                    }
                    className="tabular-nums"
                  >
                    {formatDateTime(
                      ('platform_posted_at' in s && s.platform_posted_at
                        ? s.platform_posted_at
                        : null) ??
                        ('created_at' in s && s.created_at
                          ? s.created_at
                          : s.video_date),
                    )}
                  </time>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {PLATFORM_META[s.platform].en}
                  {'batch_index' in s && s.batch_index != null ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      · batch {s.batch_index}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[280px] px-4 py-3">
                  <CopyLink url={s.url} />
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="flex items-start justify-end gap-1.5">
                    <div className="flex flex-col items-end gap-0.5">
                      {editableViews ? (
                        <ViewsCell id={s.id} views={s.views ?? 0} />
                      ) : (
                        <span className="px-2 tabular-nums">
                          {formatNumber(s.views ?? 0)}
                        </span>
                      )}
                      {err && (
                        <span
                          className="max-w-[220px] text-left text-[11px] leading-snug text-destructive"
                          title={err}
                        >
                          {err}
                        </span>
                      )}
                    </div>
                    <RefreshVideoButton submissionId={s.id} label={refreshLabel} />
                  </div>
                </td>
                {manageVideos && (
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-start justify-end gap-0.5">
                      <ReplaceSubmission id={s.id} currentUrl={s.url} />
                      <DeleteSubmission id={s.id} />
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
