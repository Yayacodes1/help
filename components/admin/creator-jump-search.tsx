'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { adminPersonHref } from '@/lib/admin-href'

export type JumpPerson = {
  id: number
  name: string
  role: string
  tiktok_username: string | null
  instagram_username: string | null
}

const RECENT_KEY = 'admin-recent-people'
const MAX_RECENT = 5

function readRecent(): number[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  } catch {
    return []
  }
}

function pushRecent(id: number) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function matches(person: JumpPerson, q: string): boolean {
  const needle = q.trim().toLowerCase().replace(/^@+/, '')
  if (!needle) return false
  const hay = [
    person.name,
    person.tiktok_username,
    person.instagram_username,
    person.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

function handleLine(person: JumpPerson): string {
  const parts: string[] = []
  if (person.instagram_username?.trim()) {
    parts.push(`IG @${person.instagram_username.replace(/^@+/, '')}`)
  }
  if (person.tiktok_username?.trim()) {
    parts.push(`TT @${person.tiktok_username.replace(/^@+/, '')}`)
  }
  return parts.join(' · ')
}

export function CreatorJumpSearch({
  people,
  roleFilter,
  projectId,
  placeholder = 'Search creator…',
  hint,
}: {
  people: JumpPerson[]
  roleFilter?: string | null
  projectId?: number | string | null
  placeholder?: string
  hint?: string
}) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [recentIds, setRecentIds] = useState<number[]>([])
  const [kbdHint, setKbdHint] = useState(hint ?? '⌘K')

  useEffect(() => {
    setRecentIds(readRecent())
    if (hint) return
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    setKbdHint(mac ? '⌘K' : 'Ctrl K')
  }, [hint])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMetaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const isSlash =
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement) &&
        !(e.target as HTMLElement | null)?.isContentEditable
      if (!isMetaK && !isSlash) return
      e.preventDefault()
      setOpen(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (q) return people.filter((p) => matches(p, q)).slice(0, 12)
    const byId = new Map(people.map((p) => [p.id, p]))
    const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as JumpPerson[]
    if (recent.length > 0) return recent
    return people.slice(0, 8)
  }, [people, query, recentIds])

  useEffect(() => {
    setActive(0)
  }, [query, open])

  function go(person: JumpPerson, panel?: string) {
    pushRecent(person.id)
    setRecentIds(readRecent())
    setOpen(false)
    setQuery('')
    router.push(
      adminPersonHref(person.id, {
        role: roleFilter,
        projectId,
        panel: panel ?? 'contracts',
        from: 'manage',
      }),
    )
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const person = filtered[active]
      if (person) go(person)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showingRecent = !query.trim() && recentIds.length > 0

  return (
    <div ref={rootRef} className="relative w-full min-w-[12rem] max-w-sm flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-lg border border-input bg-background pe-14 ps-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear"
            className="absolute end-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            {kbdHint}
          </kbd>
        )}
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No match</p>
          ) : (
            <>
              {showingRecent ? (
                <p className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recent
                </p>
              ) : null}
              <ul className="max-h-72 overflow-y-auto py-1">
                {filtered.map((person, i) => {
                  const handles = handleLine(person)
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(person)}
                        className={`flex w-full flex-col gap-0.5 px-3 py-2 text-start ${
                          i === active ? 'bg-accent' : 'hover:bg-accent/60'
                        }`}
                      >
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {person.name}
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                            {person.role === 'reposter' ? 'reposter' : 'creator'}
                          </span>
                        </span>
                        {handles ? (
                          <span className="truncate text-xs text-muted-foreground">{handles}</span>
                        ) : null}
                      </button>
                      {i === active ? (
                        <div className="flex flex-wrap gap-1 px-3 pb-2">
                          <QuickBtn label="Contracts" onClick={() => go(person, 'contracts')} />
                          <QuickBtn label="Commission" onClick={() => go(person, 'commission')} />
                          <QuickBtn label="Videos" onClick={() => go(person, 'videos')} />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-accent"
    >
      {label}
    </button>
  )
}
