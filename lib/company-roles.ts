export const EXECUTIVE_ROLES = [
  { id: 'ceo', label: 'CEO & Founder' },
  { id: 'coo', label: 'COO' },
  { id: 'deputy_coo', label: 'Deputy COO' },
] as const

export type ExecutiveRoleId = (typeof EXECUTIVE_ROLES)[number]['id']

/** Reverse of the calendar's negative company ids. Reposters stay on positive creator ids. */
export function subjectKeyFromCalendarId(id: number): string | null {
  if (id === -2) return 'executive:coo'
  if (id === -3) return 'executive:deputy_coo'
  if (id <= -200_000 && id > -300_000) {
    const outreachId = -id - 200_000
    return outreachId >= 0 ? `outreach:${outreachId}` : null
  }
  if (id <= -10_000 && id > -200_000) {
    const leaderId = -id - 10_000
    return leaderId >= 0 ? `leader:${leaderId}` : null
  }
  return null
}

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
  detailsDone: boolean
  hasTwoPays: boolean
  firstDue: number
  firstPaid: number
  firstBalance: number
  firstSettled: boolean
  firstDueOn: string | null
  firstLabel: string
  secondDue: number
  secondPaid: number
  secondBalance: number
  secondSettled: boolean
  secondDueOn: string | null
  secondLabel: string
  firstOverride: number | null
  secondOverride: number | null
  firstPayOn: string | null
  secondPayOn: string | null
  sliceOverrides: Record<string, { on?: string | null; amount?: number | null }>
  /** monthly = the saved amount is the full month. biweekly = that amount each pay. */
  basePayCadence: 'monthly' | 'biweekly'
  tiktok_username?: string | null
  instagram_username?: string | null
  notek_tiktok_username?: string | null
  notek_instagram_username?: string | null
  miqat_tiktok_username?: string | null
  miqat_instagram_username?: string | null
  login_platform?: string | null
}
