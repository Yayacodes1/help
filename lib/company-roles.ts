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

export type StructurePayTiming = 'fifteen' | 'upfront' | 'end'

export type StructurePaySlot = {
  subjectKey: string
  tier: 'ceo' | 'coo' | 'deputy_coo' | 'leader' | 'outreach' | 'reposter'
  title: string
  name: string
  href: string | null
  creatorId: number | null
  contractId: number | null
  start: string | null
  end: string | null
  timing: StructurePayTiming | null
  amount: number
  currency: 'SAR' | 'USD'
  /** True after the pay is saved, so the calendar does not invent a salary from old leader fields. */
  scheduled: boolean
  tiktok_username?: string | null
  instagram_username?: string | null
  notek_tiktok_username?: string | null
  notek_instagram_username?: string | null
  miqat_tiktok_username?: string | null
  miqat_instagram_username?: string | null
  login_platform?: string | null
}
