import { normalizeParticipantRole, type ParticipantRole } from '@/lib/participant-role'

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
  const qs = next.toString()
  return qs ? `/admin/creators/${id}?${qs}` : `/admin/creators/${id}`
}

export function roleQueryFromPerson(role: ParticipantRole | string | null | undefined): ParticipantRole {
  return normalizeParticipantRole(role)
}
