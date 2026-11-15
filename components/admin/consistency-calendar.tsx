import type { DayProgress, DayStatus } from '@/lib/consistency'

const STATUS_CLASS: Record<DayStatus, string> = {
  hit: 'bg-emerald-500/90 text-white',
  partial: 'bg-amber-400/90 text-amber-950',
  miss: 'bg-rose-500/80 text-white',
  none: 'bg-muted text-muted-foreground',
  future: 'bg-transparent border border-dashed border-border text-muted-foreground',
  break: 'bg-sky-400/90 text-sky-950',
}

const STATUS_LABEL: Record<DayStatus, string> = {
  hit: 'Hit goal',
  partial: 'Partial',
  miss: 'Missed',
  none: 'No goal',
  future: 'Upcoming',
  break: 'Break / rest (posts turn green)',
}

export function ConsistencyCalendar({
  days,
  contractEndedOn,
}: {
  days: DayProgress[]
  /** YYYY-MM-DD — ring this day and note it in the legend. */
  contractEndedOn?: string | null
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Set a streak period to see consistency.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(STATUS_LABEL) as DayStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${STATUS_CLASS[status]}`} />
            {STATUS_LABEL[status]}
          </span>
        ))}
        {contractEndedOn ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm ring-2 ring-foreground ring-offset-1 ring-offset-background" />
            Contract ended
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d) => {
          const dayNum = d.date.slice(8, 10)
          const endedHere = contractEndedOn != null && d.date === contractEndedOn
          const title = endedHere
            ? `${d.date}: Contract ended · ${STATUS_LABEL[d.status]} · IG ${d.instagram}/${d.goalInstagram} · TT ${d.tiktok}/${d.goalTiktok}`
            : `${d.date}: ${STATUS_LABEL[d.status]} · IG ${d.instagram}/${d.goalInstagram} · TT ${d.tiktok}/${d.goalTiktok}`
          return (
            <div
              key={d.date}
              title={title}
              className={`relative flex aspect-square items-center justify-center rounded-md text-[10px] font-medium tabular-nums ${STATUS_CLASS[d.status]} ${
                endedHere ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : ''
              }`}
            >
              {dayNum}
              {endedHere ? (
                <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-foreground" />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
