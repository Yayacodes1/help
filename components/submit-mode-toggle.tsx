'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function SubmitModeToggle({
  mode,
  labels,
}: {
  mode: 'post' | 'ideas'
  labels: { post: string; ideas: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function select(next: 'post' | 'ideas') {
    const q = new URLSearchParams(params.toString())
    if (next === 'post') q.delete('mode')
    else q.set('mode', 'ideas')
    router.push(`${pathname}?${q.toString()}`)
  }

  return (
    <div className="inline-flex w-full rounded-xl border border-border bg-muted/30 p-1">
      <button
        type="button"
        onClick={() => select('post')}
        className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
          mode === 'post'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {labels.post}
      </button>
      <button
        type="button"
        onClick={() => select('ideas')}
        className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
          mode === 'ideas'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {labels.ideas}
      </button>
    </div>
  )
}
