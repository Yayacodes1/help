import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

/** owner = sees everything; manager = everything except revenue, downloads, subscriptions. */
export type AdminRole = 'owner' | 'manager'

type Account = { id: string; name: string; role: AdminRole; password: string }

/**
 * ADMIN_PASSWORD_YAHYA (owner) and ADMIN_PASSWORD_AHMED (manager).
 * Legacy ADMIN_PASSWORD only works while neither new variable is set.
 */
function accounts(): Account[] {
  const out: Account[] = []
  const yahya = process.env.ADMIN_PASSWORD_YAHYA?.trim()
  const ahmed = process.env.ADMIN_PASSWORD_AHMED?.trim()
  if (yahya) out.push({ id: 'yahya', name: 'Yahya', role: 'owner', password: yahya })
  if (ahmed) out.push({ id: 'ahmed', name: 'Ahmed', role: 'manager', password: ahmed })
  if (out.length === 0) {
    const legacy = process.env.ADMIN_PASSWORD?.trim()
    if (legacy) out.push({ id: 'yahya', name: 'Yahya', role: 'owner', password: legacy })
  }
  return out
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

// Token is derived from that account's password, so a forged cookie won't validate
// and changing a password signs that person out.
function tokenFor(account: Account): string {
  const sig = createHmac('sha256', account.password)
    .update(`admin-session-v2:${account.id}`)
    .digest('hex')
  return `${account.id}.${sig}`
}

/** Returns the account id when name + password match. */
export function verifyLogin(name: string, password: string): string | null {
  const wanted = name.trim().toLowerCase()
  for (const account of accounts()) {
    if (account.id !== wanted && account.name.toLowerCase() !== wanted) continue
    return safeEqual(account.password, password) ? account.id : null
  }
  return null
}

export async function createAdminSession(accountId: string) {
  const account = accounts().find((a) => a.id === accountId)
  if (!account) throw new Error('Unknown admin account')
  const cookieStore = await cookies()
  // In the v0 preview the app renders inside a cross-site iframe. A `lax` cookie
  // is dropped on the cross-site server action requests, so outside production we
  // must use `sameSite: 'none'` (which requires `secure: true`) to keep the session.
  const isProd = process.env.NODE_ENV === 'production'
  cookieStore.set(COOKIE_NAME, tokenFor(account), {
    httpOnly: true,
    secure: true,
    sameSite: isProd ? 'lax' : 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

export async function destroyAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export type AdminSession = { id: string; name: string; role: AdminRole }

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value
  if (!value) return null
  const id = value.split('.')[0]
  const account = accounts().find((a) => a.id === id)
  if (!account || !safeEqual(tokenFor(account), value)) return null
  return { id: account.id, name: account.name, role: account.role }
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) != null
}

/** Revenue, downloads and subscriptions are owner-only. */
export async function canSeeBusiness(): Promise<boolean> {
  return (await getAdminSession())?.role === 'owner'
}
