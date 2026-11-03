/** Yahya and Ahmed can open Ahmed’s wallet. Lula cannot. */
export function canSeeAhmedWallet(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Yahya’s expenses payroll. Yahya and Ahmed only. Lula cannot open it. */
export function canSeeYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Yahya and Ahmed can move people between Yahya’s expense lists. Lula cannot. */
export function canMoveYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Ahmed and Lula can add or remove outreach logins. */
export function canManageOutreachAccounts(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula'
}

/** Ahmed, Lula, and Yahya can open the urgent pay list. */
export function canSeeUrgentList(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed' || accountId === 'lula'
}

/** Yahya, Ahmed, and Lula can open creator payout details (PayPal / bank). */
export function canSeeCreatorPayouts(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed' || accountId === 'lula'
}

/** Ahmed and Lula can add someone to the urgent pay list. */
export function canSendUrgentList(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula'
}

export type StructureTier = 'ceo' | 'coo' | 'deputy_coo' | 'leader' | 'outreach' | 'reposter'

/**
 * Yahya (CEO & Founder) and Ahmed (COO) see every company-structure payment.
 * Lula (Deputy COO) sees herself, leaders, outreach, and reposters — not the CEO or the COO.
 */
export function canSeeStructureTier(
  accountId: string | null | undefined,
  tier: StructureTier,
): boolean {
  if (accountId === 'yahya' || accountId === 'ahmed') return true
  if (accountId === 'lula') return tier !== 'ceo' && tier !== 'coo'
  return false
}
