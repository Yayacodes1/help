export const REPOSTER_TABS = {
  today: ['check', 'tasks', 'videos'],
  analytics: ['analyticsCreators', 'analyticsReposters'],
  team: ['team'],
  upload: ['upload'],
} as const

export type ReposterTab = keyof typeof REPOSTER_TABS

export const REPOSTER_TAB_ORDER: ReposterTab[] = ['today', 'analytics', 'team', 'upload']

export function resolveReposterTab(tab?: string, panel?: string): ReposterTab {
  const fromPanel = REPOSTER_TAB_ORDER.find((k) =>
    (REPOSTER_TABS[k] as readonly string[]).includes(panel ?? ''),
  )
  if (fromPanel) return fromPanel
  return REPOSTER_TAB_ORDER.includes(tab as ReposterTab) ? (tab as ReposterTab) : 'today'
}
