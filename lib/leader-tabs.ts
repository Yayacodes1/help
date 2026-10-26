export const LEADER_TABS = {
  today: ['check', 'checkReposters', 'reposterChecks', 'tasks', 'breakRequest', 'progress', 'consistency', 'attention', 'videos'],
  analytics: ['analytics', 'topvideos'],
  team: ['creators', 'manage', 'breakRequest'],
} as const

export type LeaderTab = keyof typeof LEADER_TABS

export const LEADER_TAB_ORDER: LeaderTab[] = ['today', 'analytics', 'team']

/** An open panel decides the tab (deep links keep working); otherwise `?tab=`, else Today. */
export function resolveLeaderTab(tab?: string, panel?: string): LeaderTab {
  const fromPanel = LEADER_TAB_ORDER.find((k) => (LEADER_TABS[k] as readonly string[]).includes(panel ?? ''))
  if (fromPanel) return fromPanel
  return LEADER_TAB_ORDER.includes(tab as LeaderTab) ? (tab as LeaderTab) : 'today'
}
