'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

export type PanelItem = {
  id: string
  title: string
  summary: ReactNode
  hint?: ReactNode
  /** Labeled amounts instead of a giant stat number. */
  copy?: boolean
  children: ReactNode
}

export function PanelBoard({
  panels,
  defaultOpen = null,
  columns = 4,
  closeLabel = 'Close',
}: {
  panels: PanelItem[]
  defaultOpen?: string | null
  columns?: 2 | 3 | 4
  closeLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const panelIds = new Set(panels.map((p) => p.id))
  const urlPanel = params.get('panel')
  const fromUrl =
    urlPanel && panelIds.has(urlPanel) ? urlPanel : null

  const [open, setOpen] = useState<string | null>(fromUrl ?? defaultOpen)
  const ready = useRef(false)

  useEffect(() => {
    if (!ready.current) {
      ready.current = true
      return
    }
    setOpen(fromUrl)
  }, [fromUrl])

  function selectPanel(id: string | null) {
    setOpen(id)
    const next = new URLSearchParams(params.toString())
    if (id) next.set('panel', id)
    else next.delete('panel')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const active = panels.find((p) => p.id === open) ?? null

  const gridClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4'

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-3 ${gridClass}`}>
        {panels.map((panel) => {
          const isOpen = open === panel.id
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => selectPanel(isOpen ? null : panel.id)}
              aria-expanded={isOpen}
              className={`rounded-xl border p-4 text-left transition-colors ${
                isOpen
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-card-foreground hover:border-primary/40 hover:bg-accent/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight">{panel.title}</div>
                  <div
                    className={
                      panel.copy
                        ? `mt-2 text-sm font-normal leading-snug ${
                            isOpen ? 'text-primary-foreground' : 'text-foreground'
                          }`
                        : `mt-1 text-lg font-semibold tabular-nums leading-tight ${
                            isOpen ? 'text-primary-foreground' : 'text-foreground'
                          }`
                    }
                  >
                    {panel.summary}
                  </div>
                  {panel.hint && (
                    <div
                      className={
                        panel.copy
                          ? `mt-2.5 text-sm font-normal leading-snug ${
                              isOpen ? 'text-primary-foreground/90' : 'text-muted-foreground'
                            }`
                          : `mt-1 text-xs ${
                              isOpen ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            }`
                      }
                    >
                      {panel.hint}
                    </div>
                  )}
                </div>
                <ChevronDown
                  className={`mt-0.5 size-4 shrink-0 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          )
        })}
      </div>

      {active ? (
        <div
          key={`panel-body-${active.id}`}
          className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-semibold tracking-tight">{active.title}</h2>
            <button
              type="button"
              onClick={() => selectPanel(null)}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {closeLabel}
            </button>
          </div>
          <div key={`panel-content-${active.id}`}>{active.children}</div>
        </div>
      ) : null}
    </div>
  )
}
