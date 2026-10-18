'use client'

import { useMemo, useState, useTransition } from 'react'
import { createQuickBreaks } from '@/app/actions/admin'
import { addDays } from '@/lib/campaign'
import { formatDate } from '@/lib/format'

export type BreakPerson = { id: number; name: string; role: 'creator' | 'reposter' }

export function QuickBreakPicker({
  today,
  people,
  labels,
}: {
  today: string
  people: BreakPerson[]
  labels: {
    hint: string
    search: string
    selectedEmpty: string
    giveBreak: string
    creators: string
    reposters: string
    both: string
    remove: string
    start: string
    days: string
  }
}) {
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'creator' | 'reposter' | 'all'>('creator')
  const [selected, setSelected] = useState<number[]>([])
  const [start, setStart] = useState(today)
  const [days, setDays] = useState(2)
  const [flash, setFlash] = useState<string | null>(null)
  const end = days >= 1 ? addDays(start, days - 1) : start

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const chosen = people.filter((p) => selectedSet.has(p.id))
  const pool = people.filter((p) => {
    if (selectedSet.has(p.id)) return false
    if (role !== 'all' && p.role !== role) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q)
  })

  function toggle(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((n) => n !== id) : [...cur, id]))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['creator', labels.creators],
            ['reposter', labels.reposters],
            ['all', labels.both],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRole(id)}
            className={`h-9 rounded-lg px-3 text-xs font-semibold ${
              role === id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatDate(start)} → {formatDate(end)} · {days}d
        </p>
        {chosen.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
            {labels.selectedEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {chosen.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {p.name}
                  <span className="ms-2 text-[11px] uppercase tracking-wide text-muted-foreground">{p.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {labels.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.start}
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value || today)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.days}
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending || chosen.length === 0}
          onClick={() => {
            setFlash(null)
            startTransition(async () => {
              const fd = new FormData()
              fd.set('start_date', start)
              fd.set('days', String(days))
              fd.set('reason', '2-day break')
              for (const id of selected) fd.append('creator_ids', String(id))
              const res = await createQuickBreaks(fd)
              if (res.ok) {
                setSelected([])
                setFlash(`Break set for ${res.count}`)
              } else {
                setFlash(res.error)
              }
            })
          }}
          className="h-10 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? '…' : labels.giveBreak}
        </button>
      </div>
      {flash ? <p className="text-xs text-muted-foreground">{flash}</p> : null}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.search}
        className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
      />
      <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
        {pool.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => toggle(p.id)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-accent"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.role}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
