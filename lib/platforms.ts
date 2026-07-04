import type { Platform } from '@/lib/db'

export type PlatformMeta = {
  key: Platform
  en: string
  ar: string
  hint_en: string
  hint_ar: string
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: {
    key: 'instagram',
    en: 'Instagram',
    ar: 'انستقرام',
    hint_en: 'Paste your Instagram Reel links (one per line).',
    hint_ar: 'الصق روابط ريلز انستقرام (رابط في كل سطر).',
  },
  tiktok: {
    key: 'tiktok',
    en: 'TikTok',
    ar: 'تيك توك',
    hint_en: 'Paste your TikTok video links (one per line).',
    hint_ar: 'الصق روابط فيديوهات تيك توك (رابط في كل سطر).',
  },
}

export function goalFor(
  creator: { goal_instagram: number; goal_tiktok: number },
  platform: Platform,
): number {
  if (platform === 'instagram') return creator.goal_instagram
  return creator.goal_tiktok
}
