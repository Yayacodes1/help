export function ReposterCheckBoard({
  creators,
  reposters,
  emptyLabel,
}: {
  creators: Array<{ id: number; handle: string }>
  reposters: Array<{ id: number; handle: string; checkedIds: number[] }>
  emptyLabel: string
}) {
  if (reposters.length === 0 || creators.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {reposters.map((person) => {
        const ticked = new Set(person.checkedIds)
        return (
          <li key={person.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">@{person.handle}</p>
              <p className="text-sm tabular-nums text-muted-foreground">
                {ticked.size}/{creators.length}
              </p>
            </div>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {creators.map((creator) => {
                const on = ticked.has(creator.id)
                return (
                  <li
                    key={creator.id}
                    className="flex items-center gap-2 rounded-lg bg-secondary/40 px-2 py-1.5 text-sm"
                  >
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border text-xs font-semibold ${
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {on ? '✓' : '○'}
                    </span>
                    <span className="min-w-0 truncate">@{creator.handle}</span>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
