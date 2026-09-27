'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { ADMIN_TAB_ORDER, type AdminTab } from '@/lib/admin-tabs'

export function AdminTabs({
  active,
  labels,
}: {
  active: AdminTab
  labels: Record<AdminTab, string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function select(tab: AdminTab) {
    const next = new URLSearchParams(params.toString())
    next.set('tab', tab)
    next.delete('panel')
    next.delete('aSheet')
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false })
    })
  }

  return (
    <nav className="flex items-center gap-2" aria-label="Sections">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {ADMIN_TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => select(tab)}
            aria-current={active === tab ? 'page' : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active === tab
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
      {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
    </nav>
  )
}
