'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { VIDEO_PAGE_SIZE, VIDEO_PAGE_SIZES } from '@/lib/video-page'

export function VideoPager({
  page,
  pageCount,
  total,
  pageSize,
  panel = 'videos',
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  panel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  if (total <= 0) return null

  function apply(next: URLSearchParams) {
    if (panel) next.set('panel', panel)
    const size = next.get('vSize')
    if (!size || Number(size) === VIDEO_PAGE_SIZE) next.delete('vSize')
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }

  function go(nextPage: number) {
    const next = new URLSearchParams(params.toString())
    if (nextPage <= 1) next.delete('vPage')
    else next.set('vPage', String(nextPage))
    apply(next)
  }

  function setSize(size: number) {
    const next = new URLSearchParams(params.toString())
    next.delete('vPage')
    if (size === VIDEO_PAGE_SIZE) next.delete('vSize')
    else next.set('vSize', String(size))
    apply(next)
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        {from}–{to} / {total.toLocaleString()}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Per page
          <select
            value={pageSize}
            onChange={(e) => setSize(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            {VIDEO_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          Previous
        </button>
        <span className="inline-flex h-9 items-center text-xs tabular-nums text-muted-foreground">
          {page} / {Math.max(1, pageCount)}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
