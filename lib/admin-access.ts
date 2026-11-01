/** Yahya and Ahmed can open Ahmed’s wallet. Lula cannot. */
export function canSeeAhmedWallet(accountId: string | null | undefined): boolean {
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

/** Ahmed and Lula can add someone to the urgent pay list. */
export function canSendUrgentList(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula'
}
