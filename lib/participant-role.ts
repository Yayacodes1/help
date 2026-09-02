export const PARTICIPANT_ROLES = ['creator', 'reposter'] as const
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number]

/** Dashboard filter: one role, or all people. */
export type RoleFilter = ParticipantRole | 'all'

export function isParticipantRole(value: string | null | undefined): value is ParticipantRole {
  return value === 'creator' || value === 'reposter'
}

export function normalizeParticipantRole(
  value: string | null | undefined,
): ParticipantRole {
  return value === 'reposter' ? 'reposter' : 'creator'
}

/**
 * Parse `?role=` from the admin URL.
 * Missing / invalid → creators (default). `all` → both.
 */
export function parseRoleFilter(value: string | null | undefined): RoleFilter {
  if (value === 'all') return 'all'
  if (value === 'reposter') return 'reposter'
  return 'creator'
}

/** SQL filter value: null means no role restriction (all). */
export function roleFilterToSql(filter: RoleFilter): ParticipantRole | null {
  return filter === 'all' ? null : filter
}

export function participantRoleLabel(role: ParticipantRole): string {
  return role === 'reposter' ? 'Reposter' : 'Creator'
}
