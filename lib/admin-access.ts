/** Yahya and Ahmed can open Ahmed’s wallet. Lula and Sultan cannot. */
export function canSeeAhmedWallet(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Yahya’s expenses payroll. Yahya and Ahmed only. */
export function canSeeYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Yahya and Ahmed can move people between Yahya’s expense lists. */
export function canMoveYahyaExpenses(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
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
 * Yahya (CEO & Founder) and Ahmed (COO) see every company-structure payment.
 * Lula (Deputy COO) and Sultan see leaders / outreach / reposters / deputy — not CEO or COO pay.
 */
export function canSeeStructureTier(
  accountId: string | null | undefined,
  tier: StructureTier,
): boolean {
  if (accountId === 'yahya' || accountId === 'ahmed') return true
  if (accountId === 'lula' || accountId === 'sultan') return tier !== 'ceo' && tier !== 'coo'
  return false
}
