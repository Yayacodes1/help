'use client'

import { useState, useTransition } from 'react'
import { updateViews } from '@/app/actions/admin'
import { formatNumber } from '@/lib/format'

export function ViewsCell({ id, views }: { id: number; views: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(views ?? 0))
  const [pending, startTransition] = useTransition()

  function save() {
    const next = Number(value)
    setEditing(false)
    if (!Number.isFinite(next) || next === views) {
      setValue(String(views ?? 0))
      return
    }
    startTransition(() => updateViews(id, next))
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setValue(String(views ?? 0))
            setEditing(false)
          }
        }}
        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded-md px-2 py-1 text-right text-sm tabular-nums hover:bg-accent disabled:opacity-60"
      disabled={pending}
      title="Click to edit views"
    >
      {formatNumber(views ?? 0)}
    </button>
  )
}
