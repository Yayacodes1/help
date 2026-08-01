import { Video, Camera, Music2, CalendarCheck, Flame, Trophy } from 'lucide-react'

export type CreatorStatsDisplay = {
  total_videos: number
  instagram_videos: number
  tiktok_videos: number
  active_days: number
  current_streak: number
  best_streak: number
  hit_rate: number
}

const CARDS: {
  key: keyof CreatorStatsDisplay
  label: string
  Icon: typeof Video
  accent: string
  bg: string
  format?: (n: number) => string
}[] = [
  {
    key: 'current_streak',
    label: 'السلسلة الحالية',
    Icon: Flame,
    accent: 'text-[oklch(0.62_0.22_8)]',
    bg: 'bg-[oklch(0.62_0.22_8)]/10',
  },
  {
    key: 'best_streak',
    label: 'أفضل سلسلة',
    Icon: Trophy,
    accent: 'text-[oklch(0.7_0.16_45)]',
    bg: 'bg-[oklch(0.7_0.16_45)]/10',
  },
  {
    key: 'hit_rate',
    label: 'نسبة الالتزام',
    Icon: CalendarCheck,
    accent: 'text-primary',
    bg: 'bg-primary/10',
    format: (n) => `${Math.round(n * 100)}%`,
  },
  {
    key: 'total_videos',
    label: 'إجمالي الفيديوهات',
    Icon: Video,
    accent: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    key: 'instagram_videos',
    label: 'انستقرام',
    Icon: Camera,
    accent: 'text-[oklch(0.62_0.22_8)]',
    bg: 'bg-[oklch(0.62_0.22_8)]/10',
  },
  {
    key: 'tiktok_videos',
    label: 'تيك توك',
    Icon: Music2,
    accent: 'text-[oklch(0.68_0.14_190)]',
    bg: 'bg-[oklch(0.68_0.14_190)]/10',
  },
]

export function CreatorStats({ stats }: { stats: CreatorStatsDisplay }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CARDS.map(({ key, label, Icon, accent, bg, format }, i) => (
        <div
          key={key}
          className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-card p-4 text-right shadow-sm transition-shadow duration-300 hover:shadow-md"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${bg} ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-card-foreground">
            {format ? format(stats[key]) : stats[key]}
          </div>
          <div className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  )
}
