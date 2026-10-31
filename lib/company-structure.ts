import 'server-only'
import { sql } from '@/lib/db'
import { adminPersonHref } from '@/lib/admin-href'
import {
  EXECUTIVE_ROLES,
  type CompanyStructure,
  type ExecutiveRoleId,
  type StructurePerson,
} from '@/lib/company-roles'
import { getLeaderDirectory } from '@/lib/leaders'
import { listOutreachMembers } from '@/lib/outreach'

export { EXECUTIVE_ROLES, type CompanyStructure, type ExecutiveRoleId, type StructurePerson }

export async function ensureCompanyRoleTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS company_role_names (
      role TEXT PRIMARY KEY,
      display_name TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function getExecutiveNames(): Promise<Record<ExecutiveRoleId, string | null>> {
  await ensureCompanyRoleTable()
  const rows = (await sql`
    SELECT role, display_name
    FROM company_role_names
    WHERE role IN ('ceo', 'coo', 'deputy_coo')
  `) as { role: ExecutiveRoleId; display_name: string | null }[]
  const out: Record<ExecutiveRoleId, string | null> = { ceo: null, coo: null, deputy_coo: null }
  for (const row of rows) {
    const name = row.display_name?.trim() || null
    out[row.role] = name
  }
  return out
}

export async function saveExecutiveName(role: ExecutiveRoleId, name: string | null) {
  await ensureCompanyRoleTable()
  const display = name?.trim() ? name.trim().slice(0, 80) : null
  await sql`
    INSERT INTO company_role_names (role, display_name, updated_at)
    VALUES (${role}, ${display}, NOW())
    ON CONFLICT (role) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
  `
}

export async function getCompanyStructure(): Promise<CompanyStructure> {
  const [names, directory, outreachMembers] = await Promise.all([
    getExecutiveNames(),
    getLeaderDirectory(),
    listOutreachMembers(),
  ])

  const leaders = directory.leaders.map((leader) => ({
    key: `leader:${leader.id}`,
    name: leader.name,
    href: `/admin/leaders/${leader.id}`,
  }))

  const seenOutreach = new Set<string>()
  const outreach: StructurePerson[] = []
  for (const member of outreachMembers) {
    if (member.role !== 'outreach') continue
    const identity = member.creatorId
      ? `creator:${member.creatorId}`
      : member.leaderId
        ? `leader:${member.leaderId}`
        : `member:${member.id}`
    if (seenOutreach.has(identity)) continue
    seenOutreach.add(identity)
    outreach.push({
      key: identity,
      name: member.creatorName || member.leaderName || member.name,
      href: member.creatorId
        ? adminPersonHref(member.creatorId, { role: 'reposter', panel: 'manage', from: 'structure' })
        : member.leaderId
          ? `/admin/leaders/${member.leaderId}`
          : null,
    })
  }

  const seenReposter = new Set<number>()
  const reposters: StructurePerson[] = []
  for (const person of directory.reposters) {
    if (seenReposter.has(person.id)) continue
    seenReposter.add(person.id)
    reposters.push({
      key: `reposter:${person.id}`,
      name: person.name,
      href: adminPersonHref(person.id, { role: 'reposter', panel: 'manage', from: 'structure' }),
    })
  }

  return {
    executives: EXECUTIVE_ROLES.map((role) => ({
      id: role.id,
      label: role.label,
      name: names[role.id],
    })),
    leaders,
    outreach,
    reposters,
  }
}
