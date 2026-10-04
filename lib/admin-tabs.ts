export const ADMIN_TABS = {
  today: ['progress', 'attention', 'reviews', 'strikes', 'videos'],
  analytics: ['analytics', 'ranking', 'projectviews', 'topvideos', 'miqatcontest'],
  money: ['marketing', 'commission', 'paydue', 'payments', 'outflow'],
  people: ['manage'],
} as const

export type AdminTab = keyof typeof ADMIN_TABS

export const ADMIN_TAB_ORDER: AdminTab[] = ['today', 'analytics', 'money', 'people']

/** An open panel decides the tab (deep links keep working); otherwise `?tab=`, else Today. */
export function resolveAdminTab(tab?: string, panel?: string): AdminTab {
  const fromPanel = ADMIN_TAB_ORDER.find((k) =>
    (ADMIN_TABS[k] as readonly string[]).includes(panel ?? ''),
  )
  if (fromPanel) return fromPanel
  return ADMIN_TAB_ORDER.includes(tab as AdminTab) ? (tab as AdminTab) : 'today'
}
