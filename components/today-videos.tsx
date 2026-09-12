'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteOwnSubmission } from '@/app/actions/creator'
import { CopyLink } from '@/components/copy-link'
import { formatDateTime } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { Submission } from '@/lib/db'
import type { Locale } from '@/lib/i18n'

export function TodayVideos({
  username,
  submissions,
  locale,
}: {
  username: string
  submissions: Array<Submission & { project_name?: string | null }>
  locale: Locale
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
            {s.project_name ? (
              <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
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
              {s.created_at ? (
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {formatDateTime(s.created_at, locale)}
                </p>
              ) : null}
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
