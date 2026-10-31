export const EXECUTIVE_ROLES = [
  { id: 'ceo', label: 'CEO & Founder' },
  { id: 'coo', label: 'COO' },
  { id: 'deputy_coo', label: 'Deputy COO' },
] as const

export type ExecutiveRoleId = (typeof EXECUTIVE_ROLES)[number]['id']

export type StructurePerson = {
  key: string
  name: string
  href: string | null
}

export type CompanyStructure = {
  executives: Array<{ id: ExecutiveRoleId; label: string; name: string | null }>
  leaders: StructurePerson[]
  outreach: StructurePerson[]
  reposters: StructurePerson[]
}
