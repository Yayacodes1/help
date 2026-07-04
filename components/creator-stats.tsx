import { Video, Camera, Music2, CalendarCheck } from 'lucide-react'
import type { CreatorStats } from '@/lib/queries'

const CARDS = [
  {
    key: 'total_videos' as const,
    label: 'إجمالي الفيديوهات',
    Icon: Video,
    accent: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    key: 'instagram_videos' as const,
    label: 'انستقرام',
    Icon: Camera,
    accent: 'text-[oklch(0.62_0.22_8)]',
    bg: 'bg-[oklch(0.62_0.22_8)]/10',
  },
  {
    key: 'tiktok_videos' as const,
    label: 'تيك توك',
    Icon: Music2,
    accent: 'text-[oklch(0.68_0.14_190)]',
    bg: 'bg-[oklch(0.68_0.14_190)]/10',
  },
  {
    key: 'active_days' as const,
    label: 'أيام النشر',
    Icon: CalendarCheck,
    accent: 'text-[oklch(0.7_0.16_45)]',
    bg: 'bg-[oklch(0.7_0.16_45)]/10',
  },
]

export function CreatorStats({ stats }: { stats: CreatorStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map(({ key, label, Icon, accent, bg }, i) => (
        <div
          key={key}
          className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-card p-4 text-right shadow-sm transition-shadow duration-300 hover:shadow-md"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
        >
          <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${bg} ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-2xl font-semibold tabular-nums text-card-foreground">
            {stats[key]}
          </div>
          <div className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  )
}
