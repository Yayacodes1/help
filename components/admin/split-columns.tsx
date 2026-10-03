import type { ReactNode } from 'react'

export type SplitSide = {
  key: string | number
  title: string
  summary?: ReactNode
  children: ReactNode
}

/** Projects next to each other (left/right) on wide screens, stacked on phones. */
export function SplitColumns({ sides }: { sides: SplitSide[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sides.map((side) => (
        <section
          key={side.key}
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background/40 p-3"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
            <h3 className="text-base font-semibold tracking-tight">{side.title}</h3>
            {side.summary != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">{side.summary}</span>
            ) : null}
          </header>
          {side.children}
        </section>
      ))}
    </div>
  )
}
