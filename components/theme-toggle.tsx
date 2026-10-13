'use client'

import { Moon, Sun } from 'lucide-react'

const THEME_COOKIE = 'app_theme'
const THEME_COLORS = { light: '#f7ebe0', dark: '#17100f' } as const

/** Icons swap with CSS, so the server and client render the same markup. */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement
    const next = root.classList.contains('dark') ? 'light' : 'dark'
    root.classList.remove('light', 'dark')
    root.classList.add(next)
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next])
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Dark / light mode"
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  )
}
