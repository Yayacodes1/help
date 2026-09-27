export function StrikeBanner({
  count,
  postedToday,
  labels,
}: {
  count: number
  postedToday: boolean
  labels: {
    none: string
    one: string
    two: string
    three: string
    posted: string
    missed: string
    hint: string
  }
}) {
  const message =
    count <= 0 ? labels.none : count === 1 ? labels.one : count === 2 ? labels.two : labels.three
  const alert = count >= 3

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${
        alert
          ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-[#9a0d18] dark:text-card-foreground'
          : count > 0
            ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100'
            : 'border-[#e8cfc0] dark:border-border bg-[#fff8f3] dark:bg-card text-[#9a0d18] dark:text-card-foreground'
      }`}
    >
      <p className="text-sm font-semibold">{message}</p>
      <p className="mt-1 text-xs opacity-80">
        {postedToday ? labels.posted : labels.missed}
        {' · '}
        {labels.hint}
      </p>
    </section>
  )
}
