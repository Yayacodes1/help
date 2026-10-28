'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { updateViews } from '@/app/actions/admin'
import { formatNumber } from '@/lib/format'
import { SUBMISSION_VIEWS_EVENT } from '@/components/admin/refresh-views-button'

export function ViewsCell({
  id,
  views,
  editable = true,
}: {
  id: number
  views: number
  editable?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [liveViews, setLiveViews] = useState(views ?? 0)
  const [value, setValue] = useState(String(views ?? 0))
  const [pending, startTransition] = useTransition()
  const announced = useRef<number | null>(null)

  useEffect(() => {
    if (announced.current != null) {
      setLiveViews(announced.current)
      setValue(String(announced.current))
      return
    }
    setLiveViews(views ?? 0)
    setValue(String(views ?? 0))
  }, [views])

  useEffect(() => {
    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<{ id?: number; views?: number }>).detail
      if (detail?.id !== id || typeof detail.views !== 'number') return
      if (!Number.isFinite(detail.views) || detail.views < 0) return
      announced.current = detail.views
      setLiveViews(detail.views)
      setValue(String(detail.views))
    }
    window.addEventListener(SUBMISSION_VIEWS_EVENT, onUpdate)
    return () => window.removeEventListener(SUBMISSION_VIEWS_EVENT, onUpdate)
  }, [id])

  function save() {
    const next = Number(value)
    setEditing(false)
    if (!Number.isFinite(next) || next === liveViews) {
      setValue(String(liveViews ?? 0))
      return
    }
    setLiveViews(next)
    startTransition(() => updateViews(id, next))
  }

  if (!editable) {
    return (
      <span className="px-2 tabular-nums">{formatNumber(liveViews ?? 0)}</span>
    )
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
            setValue(String(liveViews ?? 0))
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
      {formatNumber(liveViews ?? 0)}
    </button>
  )
}
