'use client'

import { useMemo, useState } from 'react'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { formatNumber } from '@/lib/format'

type PlatformFilter = 'both' | 'instagram' | 'tiktok'

type Submission = {
  id: number
  creator_id?: number
  creator_name?: string
  project_name?: string | null
  video_date: string
  platform: 'instagram' | 'tiktok'
  url: string
  views: number
  views_error?: string | null
}

export function CreatorVideosPanel({
  submissions,
  emptyLabel,
  labels,
}: {
  submissions: Submission[]
  emptyLabel: string
  labels: {
    both: string
    instagram: string
    tiktok: string
    videos: string
    views: string
    noMatch: string
  }
}) {
  const [platform, setPlatform] = useState<PlatformFilter>('both')

  const counts = useMemo(() => {
    let instagram = 0
    let tiktok = 0
    let viewsIg = 0
    let viewsTt = 0
    for (const s of submissions) {
      if (s.platform === 'instagram') {
        instagram++
        viewsIg += s.views ?? 0
      } else {
        tiktok++
        viewsTt += s.views ?? 0
      }
    }
    return {
      both: instagram + tiktok,
      instagram,
      tiktok,
      viewsBoth: viewsIg + viewsTt,
      viewsIg,
      viewsTt,
    }
  }, [submissions])

  const filtered = useMemo(() => {
    if (platform === 'both') return submissions
    return submissions.filter((s) => s.platform === platform)
  }, [submissions, platform])

  const activeCount =
    platform === 'both'
      ? counts.both
      : platform === 'instagram'
        ? counts.instagram
        : counts.tiktok
  const activeViews =
    platform === 'both'
      ? counts.viewsBoth
      : platform === 'instagram'
        ? counts.viewsIg
        : counts.viewsTt

  const tabs: { id: PlatformFilter; label: string; count: number }[] = [
    { id: 'both', label: labels.both, count: counts.both },
    { id: 'instagram', label: labels.instagram, count: counts.instagram },
    { id: 'tiktok', label: labels.tiktok, count: counts.tiktok },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="tablist"
          aria-label={labels.both}
        >
          {tabs.map((tab) => {
            const selected = platform === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPlatform(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.label}
                <span className="ms-1.5 tabular-nums opacity-80">{tab.count}</span>
              </button>
            )
          })}
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">
            {formatNumber(activeCount)}
          </span>{' '}
          {labels.videos}
          <span className="mx-1.5 text-border">·</span>
          <span className="font-semibold text-foreground">
            {formatNumber(activeViews)}
          </span>{' '}
          {labels.views}
        </p>
      </div>

      <SubmissionsTable
        submissions={filtered}
        emptyLabel={filtered.length === 0 && submissions.length > 0 ? labels.noMatch : emptyLabel}
        showCreator={false}
        showProject={false}
        editableViews={false}
      />
    </div>
  )
}
