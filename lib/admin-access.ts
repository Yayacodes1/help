/** Yahya and Ahmed can open Ahmed’s wallet. Lula cannot. */
export function canSeeAhmedWallet(accountId: string | null | undefined): boolean {
  return accountId === 'yahya' || accountId === 'ahmed'
}

/** Ahmed and Lula can add or remove outreach logins. */
export function canManageOutreachAccounts(accountId: string | null | undefined): boolean {
  return accountId === 'ahmed' || accountId === 'lula'
}
