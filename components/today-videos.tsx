'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteOwnSubmission } from '@/app/actions/creator'
import { PLATFORM_META } from '@/lib/platforms'
import type { Submission } from '@/lib/db'

export function TodayVideos({
  username,
  submissions,
}: {
  username: string
  submissions: Submission[]
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
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-foreground underline-offset-2 hover:underline"
              dir="ltr"
            >
              {s.url}
            </a>
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
