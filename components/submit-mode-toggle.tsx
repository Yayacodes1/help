'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type SubmitMode = 'post' | 'ideas' | 'mine'

export function SubmitModeToggle({
  mode,
  labels,
}: {
  mode: SubmitMode
  labels: { post: string; ideas: string; mine: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function select(next: SubmitMode) {
    const q = new URLSearchParams(params.toString())
    if (next === 'post') q.delete('mode')
    else q.set('mode', next)
    router.push(`${pathname}?${q.toString()}`)
  }

  return (
    <div className="inline-flex w-full rounded-xl border border-border bg-muted/30 p-1">
      {(
        [
          ['post', labels.post],
          ['ideas', labels.ideas],
          ['mine', labels.mine],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => select(key)}
          className={`flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
            mode === key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
