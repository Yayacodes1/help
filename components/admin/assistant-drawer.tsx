'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'

/** Collapsed-by-default shell so the assistant doesn't dominate the admin page. */
export function AssistantDrawer({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string
  subtitle: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            {!open && (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? <div className="border-t border-border px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  )
}
