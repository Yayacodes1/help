'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteOwnSubmission, updateOwnSubmissionProject } from '@/app/actions/creator'
import { CopyLink } from '@/components/copy-link'
import { PLATFORM_META } from '@/lib/platforms'
import { projectToneClass } from '@/lib/project-scope'
import type { Submission } from '@/lib/db'
import type { Locale } from '@/lib/i18n'

function riyadhTime(value: string | null | undefined, withDay = false): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('ar-u-nu-latn', {
    timeZone: 'Asia/Riyadh',
    ...(withDay ? { day: 'numeric', month: 'short' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export function TodayVideos({
  username,
  submissions,
  locale,
  projects = [],
  changeProjectLabel = 'Change project',
}: {
  username: string
  submissions: Array<Submission & { project_name?: string | null }>
  locale: Locale
  projects?: { id: number; name: string }[]
  changeProjectLabel?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (submissions.length === 0) {
    return (
      <p dir="rtl" className="text-right text-sm text-muted-foreground">
        لا توجد فيديوهات لهذا اليوم بعد.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {submissions.map((s) => {
        const meta = PLATFORM_META[s.platform]
        return (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {meta.ar}
            </span>
            {projects.length > 0 ? (
              <select
                value={s.project_id ?? ''}
                disabled={pending}
                aria-label={changeProjectLabel}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (!Number.isFinite(next) || next <= 0) return
                  startTransition(async () => {
                    await updateOwnSubmissionProject(username, s.id, next)
                    router.refresh()
                  })
                }}
                className={`h-7 shrink-0 rounded-full border px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${projectToneClass(s.project_name)}`}
              >
                {s.project_id == null ? <option value="">—</option> : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : s.project_name ? (
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${projectToneClass(s.project_name)}`}
              >
                {s.project_name}
              </span>
            ) : null}
            {s.batch_index != null ? (
              <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                دفعة {s.batch_index}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <CopyLink url={s.url} copyLabel="نسخ" copiedLabel="تم" />
              <p dir="rtl" className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                {riyadhTime(s.created_at) ? (
                  <span>
                    وقت النشر: <span className="font-medium text-foreground">{riyadhTime(s.created_at)}</span>
                  </span>
                ) : null}
                {riyadhTime(s.submitted_at, true) ? (
                  <span>
                    {' · '}أُرسل: {riyadhTime(s.submitted_at, true)}
                  </span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              aria-label="حذف الفيديو"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteOwnSubmission(username, s.id)
                  router.refresh()
                })
              }
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
