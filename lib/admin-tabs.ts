export const ADMIN_TABS = {
  today: ['leaders', 'progress', 'attention', 'reviews', 'strikes', 'videos'],
  twoday: ['quickBreak', 'breakRequests'],
  analytics: ['analytics', 'ranking', 'projectviews', 'topvideos', 'miqatcontest'],
  money: ['yahya', 'marketing', 'payouts', 'calendar', 'commission', 'paydue', 'payments', 'archive', 'outflow'],
  people: [
    'look',
    'consistency',
    'fitness',
    'streaks',
    'offers',
    'manage',
    'ends',
    'urgent',
    'timeline',
    'outreach',
    'structure',
  ],
} as const

export type AdminTab = keyof typeof ADMIN_TABS

export const ADMIN_TAB_ORDER: AdminTab[] = ['today', 'twoday', 'analytics', 'money', 'people']

/** An open panel decides the tab (deep links keep working); otherwise `?tab=`, else Today. */
export function resolveAdminTab(tab?: string, panel?: string): AdminTab {
  const fromPanel = ADMIN_TAB_ORDER.find((k) =>
    (ADMIN_TABS[k] as readonly string[]).includes(panel ?? ''),
  )
  if (fromPanel) return fromPanel
  return ADMIN_TAB_ORDER.includes(tab as AdminTab) ? (tab as AdminTab) : 'today'
}
