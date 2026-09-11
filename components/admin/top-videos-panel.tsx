'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { TopVideoRow } from '@/lib/analytics'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { formatDate, formatNumber } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'

export function TopVideosPanel({
  videos,
  today,
  defaultFrom,
  defaultTo,
}: {
  videos: TopVideoRow[]
  today: string
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const from = params.get('tvFrom') || defaultFrom
  const to = params.get('tvTo') || defaultTo
  const platform = params.get('tvPlatform') || ''

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'topvideos')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`/admin?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <DateRangePresets
        today={today}
        from={from}
        to={to}
        onSelect={(nextFrom, nextTo) => push({ tvFrom: nextFrom, tvTo: nextTo })}
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => push({ tvFrom: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => push({ tvTo: e.target.value })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Platform
          <select
            value={platform}
            onChange={(e) => push({ tvPlatform: e.target.value || null })}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="">All platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>
      </div>

      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No videos in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Creator</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Platform</th>
                <th className="px-3 py-2 font-medium">Views</th>
                <th className="px-3 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {videos.map((v, i) => (
                <tr key={v.id} className="align-top">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={adminPersonHref(v.creator_id, {
                        role: params.get('role'),
                        projectId: params.get('project'),
                      })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {v.creator_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{v.project_name ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(v.video_date)}</td>
                  <td className="px-3 py-2 capitalize">{v.platform}</td>
                  <td className="px-3 py-2 font-semibold">{formatNumber(v.views)}</td>
                  <td className="px-3 py-2">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline-offset-4 hover:underline break-all"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
