'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

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
  if (pageCount <= 1) return null

  function go(nextPage: number) {
    const next = new URLSearchParams(params.toString())
    if (nextPage <= 1) next.delete('vPage')
    else next.set('vPage', String(nextPage))
    if (panel) next.set('panel', panel)
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        {from}–{to} / {total}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          ←
        </button>
        <span className="inline-flex h-9 items-center text-xs tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  )
}
