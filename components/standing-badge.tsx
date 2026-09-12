import type { Standing, StandingBand } from '@/lib/commission'

const BAND_CLASS: Record<StandingBand, string> = {
  excellent: 'bg-emerald-700 text-white',
  good: 'bg-emerald-500 text-white',
  okay: 'bg-amber-400 text-amber-950',
  bad: 'bg-orange-500 text-white',
  veryBad: 'bg-rose-500 text-white',
  none: 'bg-muted text-muted-foreground',
}

export function StandingBadge({
  standing,
  size = 'md',
}: {
  standing: Standing
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad} ${BAND_CLASS[standing.band]}`}
      title={standing.score != null ? `${standing.score} / 10` : standing.label}
    >
      <span className="tabular-nums">{standing.score ?? '—'}</span>
      <span>{standing.label}</span>
    </span>
  )
}

export function ScoreDot({
  score,
  label,
}: {
  score: number | null
  label: string
}) {
  const standing = {
    score,
    band:
      score == null
        ? 'none'
        : score >= 9
          ? 'excellent'
          : score >= 7
            ? 'good'
            : score >= 5
              ? 'okay'
              : score >= 3
                ? 'bad'
                : 'veryBad',
    label,
  } as Standing
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`${label}: ${score ?? '—'}`}>
      <span className={`size-2.5 rounded-full ${BAND_CLASS[standing.band]}`} />
      {label}
    </span>
  )
}
