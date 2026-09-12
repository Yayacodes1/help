'use client'

import { Suspense, useMemo, useState } from 'react'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { formatNumber } from '@/lib/format'

type PlatformFilter = 'both' | 'instagram' | 'tiktok'

type Submission = {
  id: number
  creator_id?: number
  creator_name?: string
  project_id?: number | null
  project_name?: string | null
  video_date: string
  created_at?: string | null
  platform: 'instagram' | 'tiktok'
  url: string
  views: number
  views_error?: string | null
}

export function CreatorVideosPanel({
  creatorId,
  submissions,
  emptyLabel,
  labels,
}: {
  creatorId: number
  submissions: Submission[]
  emptyLabel: string
  labels: {
    both: string
    instagram: string
    tiktok: string
    videos: string
    views: string
    noMatch: string
    refreshViews: string
    refreshThisVideo: string
  }
}) {
  const [platform, setPlatform] = useState<PlatformFilter>('both')
  const [project, setProject] = useState<string>('all')

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

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of submissions) {
      if (s.project_name) names.add(s.project_name)
    }
    return [...names].sort()
  }, [submissions])

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (platform !== 'both' && s.platform !== platform) return false
      if (project !== 'all' && (s.project_name ?? '') !== project) return false
      return true
    })
  }, [submissions, platform, project])

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
        <div className="flex flex-wrap items-center gap-2">
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
        {projectNames.length > 0 ? (
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
            aria-label="Filter by project"
          >
            <option value="all">All projects</option>
            {projectNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
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

      <Suspense
        fallback={<p className="text-xs text-muted-foreground">Loading refresh…</p>}
      >
        <RefreshViewsButton
          label={labels.refreshViews}
          creatorId={creatorId}
          allDates
        />
      </Suspense>

      <SubmissionsTable
        submissions={filtered}
        emptyLabel={filtered.length === 0 && submissions.length > 0 ? labels.noMatch : emptyLabel}
        showCreator={false}
        showProject={true}
        editableViews={false}
        refreshLabel={labels.refreshThisVideo}
      />
    </div>
  )
}
