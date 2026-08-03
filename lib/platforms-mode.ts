export const PLATFORMS_MODES = ['both', 'instagram', 'tiktok'] as const
export type PlatformsMode = (typeof PLATFORMS_MODES)[number]

export function normalizePlatforms(value: string | null | undefined): PlatformsMode {
  if (value === 'instagram' || value === 'tiktok') return value
  return 'both'
}

export function platformsLabel(mode: PlatformsMode): string {
  if (mode === 'instagram') return 'Instagram only'
  if (mode === 'tiktok') return 'TikTok only'
  return 'Instagram + TikTok'
}

/** Zero out quotas for platforms that are off. */
export function applyPlatformsToQuotas<
  T extends {
    goalInstagram: number
    goalTiktok: number
    targetInstagram: number
    targetTiktok: number
  },
>(mode: PlatformsMode, quotas: T): T {
  if (mode === 'instagram') {
    return { ...quotas, goalTiktok: 0, targetTiktok: 0 }
  }
  if (mode === 'tiktok') {
    return { ...quotas, goalInstagram: 0, targetInstagram: 0 }
  }
  return quotas
}

/**
 * Video-target completion (0–1). Prefer this over days-hit when totals are set.
 * Unused platforms (mode / zero targets) do not count against the creator.
 */
export function videoCompletionRate(options: {
  postedInstagram: number
  postedTiktok: number
  targetInstagram: number
  targetTiktok: number
  platforms?: string | null
}): number | null {
  const mode = normalizePlatforms(options.platforms)
  const needIg = mode === 'tiktok' ? 0 : Math.max(0, options.targetInstagram)
  const needTt = mode === 'instagram' ? 0 : Math.max(0, options.targetTiktok)
  const need = needIg + needTt
  if (need <= 0) return null
  const got =
    (needIg > 0 ? Math.min(options.postedInstagram, needIg) : 0) +
    (needTt > 0 ? Math.min(options.postedTiktok, needTt) : 0)
  return Math.min(1, got / need)
}
