import type { DayProgress, DayStatus } from '@/lib/consistency'

const STATUS_CLASS: Record<DayStatus, string> = {
  hit: 'bg-emerald-500/90 text-white',
  partial: 'bg-amber-400/90 text-amber-950',
  miss: 'bg-rose-500/80 text-white',
  none: 'bg-muted text-muted-foreground',
  future: 'bg-transparent border border-dashed border-border text-muted-foreground',
}

const STATUS_LABEL: Record<DayStatus, string> = {
  hit: 'Hit goal',
  partial: 'Partial',
  miss: 'Missed',
  none: 'No goal',
  future: 'Upcoming',
}

export function ConsistencyCalendar({ days }: { days: DayProgress[] }) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Set a contract start date to see consistency.
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
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d) => {
          const dayNum = d.date.slice(8, 10)
          const title = `${d.date}: ${STATUS_LABEL[d.status]} · IG ${d.instagram}/${d.goalInstagram} · TT ${d.tiktok}/${d.goalTiktok}`
          return (
            <div
              key={d.date}
              title={title}
              className={`flex aspect-square items-center justify-center rounded-md text-[10px] font-medium tabular-nums ${STATUS_CLASS[d.status]}`}
            >
              {dayNum}
            </div>
          )
        })}
      </div>
    </div>
  )
}
