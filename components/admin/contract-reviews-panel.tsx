'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ContractReview } from '@/lib/contract-reviews'
import { markAllContractReviewsDone, markContractReviewDone } from '@/app/actions/admin'
import { adminPersonHref } from '@/lib/admin-href'
import { formatDate, formatNumber } from '@/lib/format'
import { projectToneClass } from '@/lib/project-scope'

export function ContractReviewsPanel({
  reviews,
  projectId,
  labels,
}: {
  reviews: ContractReview[]
  projectId?: number | string | null
  labels: { hint: string; empty: string; reviewed: string; reviewedAll: string; week: string }
}) {
  const [pending, startTransition] = useTransition()

  if (reviews.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {labels.empty}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{labels.hint}</p>
        {reviews.length > 1 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => markAllContractReviewsDone())}
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {labels.reviewedAll}
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {reviews.map((r) => {
          const trend =
            r.prevVideos != null
              ? ` · week before ${r.prevVideos} videos · ${formatNumber(r.prevViews ?? 0)} views`
              : ''
          return (
            <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={adminPersonHref(r.creatorId, { projectId, panel: 'videos', from: 'reviews' })}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {r.creatorName}
                    </Link>
                    {r.projectName ? (
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${projectToneClass(r.projectName)}`}
                      >
                        {r.projectName}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.contractName} · {labels.week} {r.weekNumber} · {formatDate(r.weekStart)} →{' '}
                    {formatDate(r.weekEnd)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => markContractReviewDone(r.id))}
                  className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {labels.reviewed}
                </button>
              </div>
              <p className="mt-2 text-xs tabular-nums">
                <span className="font-medium">{r.videos}</span> videos (IG {r.instagram} · TT {r.tiktok}) ·{' '}
                <span className="font-medium">{formatNumber(r.views)}</span> views
                <span className="text-muted-foreground">{trend}</span>
              </p>
              {r.topUrl ? (
                <a
                  href={r.topUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline-offset-4 hover:underline"
                >
                  Top video · {formatNumber(r.topViews ?? 0)} views
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              ) : null}
              {r.profiles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.profiles.map((p) => (
                    <a
                      key={p.url}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium hover:bg-accent"
                    >
                      {p.label}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
