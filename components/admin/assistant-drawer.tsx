'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { ChevronDown, Maximize2, Minimize2, Sparkles } from 'lucide-react'

/** Collapsed-by-default shell so the assistant doesn't dominate the admin page. */
export function AssistantDrawer({
  title,
  subtitle,
  children,
  defaultOpen = false,
  maximizeLabel = 'Maximize',
  minimizeLabel = 'Minimize',
}: {
  title: string
  subtitle: string
  children: ReactNode
  defaultOpen?: boolean
  maximizeLabel?: string
  minimizeLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!maximized) return
    setOpen(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMaximized(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [maximized])

  const inner =
    isValidElement(children)
      ? cloneElement(children as ReactElement<{ maximized?: boolean }>, {
          maximized,
        })
      : children

  return (
    <>
      {maximized ? (
        <button
          type="button"
          aria-label={minimizeLabel}
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setMaximized(false)}
        />
      ) : null}
      <section
        className={
          maximized
            ? 'fixed inset-3 z-50 flex flex-col rounded-xl border border-border bg-card shadow-2xl'
            : 'rounded-xl border border-border bg-card'
        }
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (maximized) return
              setOpen((v) => !v)
            }}
            aria-expanded={open || maximized}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">{title}</div>
                {!open && !maximized && (
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                )}
              </div>
            </div>
            {!maximized && (
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMaximized((v) => !v)}
            title={maximized ? minimizeLabel : maximizeLabel}
            aria-label={maximized ? minimizeLabel : maximizeLabel}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/40"
          >
            {maximized ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        </div>
        {open || maximized ? (
          <div
            className={
              maximized
                ? 'flex min-h-0 flex-1 flex-col border-t border-border px-4 pb-4 pt-3'
                : 'border-t border-border px-4 pb-4 pt-3'
            }
          >
            {inner}
          </div>
        ) : null}
      </section>
    </>
  )
}
