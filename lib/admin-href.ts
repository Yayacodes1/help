import { normalizeParticipantRole, type ParticipantRole } from '@/lib/participant-role'

const ADMIN_PANELS = new Set([
  'analytics',
  'ranking',
  'projectviews',
  'topvideos',
  'progress',
  'attention',
  'reviews',
  'videos',
  'paydue',
  'commission',
  'payments',
  'marketing',
  'outflow',
  'calendar',
  'manage',
  'structure',
  'strikes',
])

export function adminReturnPanel(from?: string | null): string {
  return from && ADMIN_PANELS.has(from) ? from : 'manage'
}

export function adminDashboardHref(opts?: {
  role?: string | null
  projectId?: number | string | null
  panel?: string | null
  extra?: Record<string, string | number | null | undefined>
}): string {
  const next = new URLSearchParams()
  const role = opts?.role
  if (role === 'reposter' || role === 'all') next.set('role', role)
  const projectId = opts?.projectId
  if (projectId != null && String(projectId) !== '') {
    next.set('project', String(projectId))
  }
  if (opts?.panel) next.set('panel', opts.panel)
  if (opts?.extra) {
    for (const [key, value] of Object.entries(opts.extra)) {
      if (value == null || value === '') continue
      next.set(key, String(value))
    }
  }
  const qs = next.toString()
  return qs ? `/admin?${qs}` : '/admin'
}

export function adminPersonHref(
  id: number,
  opts?: {
    role?: string | null
    panel?: string | null
    projectId?: number | string | null
    from?: string | null
  },
): string {
  const next = new URLSearchParams()
  const role = opts?.role
  if (role === 'reposter' || role === 'all') next.set('role', role)
  if (opts?.panel) next.set('panel', opts.panel)
  const projectId = opts?.projectId
  if (projectId != null && String(projectId) !== '') {
    next.set('project', String(projectId))
  }
  if (opts?.from && ADMIN_PANELS.has(opts.from)) next.set('from', opts.from)
  const qs = next.toString()
  return qs ? `/admin/creators/${id}?${qs}` : `/admin/creators/${id}`
}

/** Which dashboard a shared table lives in, so its name links stay inside it. */
export type LinkScope = 'admin' | 'leader'

export function leaderPersonHref(id: number, opts?: { panel?: string | null }): string {
  return opts?.panel ? `/leader/creators/${id}?panel=${opts.panel}` : `/leader/creators/${id}`
}

export function scopedPersonHref(
  scope: LinkScope,
  id: number,
  opts?: Parameters<typeof adminPersonHref>[1],
): string {
  return scope === 'leader' ? leaderPersonHref(id, { panel: opts?.panel }) : adminPersonHref(id, opts)
}

export function roleQueryFromPerson(role: ParticipantRole | string | null | undefined): ParticipantRole {
  return normalizeParticipantRole(role)
}
