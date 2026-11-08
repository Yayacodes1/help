/** Yahya, Ahmed, and Sultan can open Ahmed’s wallet. Lula cannot. */
export function canSeeAhmedWallet(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed' || accountId === 'sultan'
}

/** Yahya’s expenses payroll. Yahya, Ahmed, and Sultan. Lula cannot open it. */
export function canSeeYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed' || accountId === 'sultan'
}

/** Yahya, Ahmed, and Sultan can move people between Yahya’s expense lists. Lula cannot. */
export function canMoveYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed' || accountId === 'sultan'
}

/** Ahmed, Lula, and Sultan can add or remove outreach logins. */
export function canManageOutreachAccounts(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula' || accountId === 'sultan'
}

/** Yahya, Ahmed, Lula, and Sultan can open the urgent pay list. */
export function canSeeUrgentList(accountId: string | null | undefined): boolean {
  return (
    accountId === 'yahya' ||
    accountId === 'ahmed' ||
    accountId === 'lula' ||
    accountId === 'sultan'
  )
}

/** Yahya, Ahmed, Lula, and Sultan can open creator payout details (PayPal / bank). */
export function canSeeCreatorPayouts(accountId: string | null | undefined): boolean {
  return (
    accountId === 'yahya' ||
    accountId === 'ahmed' ||
    accountId === 'lula' ||
    accountId === 'sultan'
  )
}

/** Ahmed, Lula, and Sultan can add someone to the urgent pay list. */
export function canSendUrgentList(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula' || accountId === 'sultan'
}

export type StructureTier = 'ceo' | 'coo' | 'deputy_coo' | 'leader' | 'outreach' | 'reposter'

/**
 * Yahya (CEO & Founder), Ahmed (COO), and Sultan see every company-structure payment.
 * Lula (Deputy COO) sees herself, leaders, outreach, and reposters — not the CEO or the COO.
 */
export function canSeeStructureTier(
  accountId: string | null | undefined,
  tier: StructureTier,
): boolean {
  if (accountId === 'yahya' || accountId === 'ahmed' || accountId === 'sultan') return true
  if (accountId === 'lula') return tier !== 'ceo' && tier !== 'coo'
  return false
}
