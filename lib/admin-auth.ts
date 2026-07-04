import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'

function getPassword(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD is not set')
  return password
}

// Deterministic token derived from the admin password. Only someone who knows
// the password can produce a matching value, so a forged cookie won't validate.
function expectedToken(): string {
  return createHmac('sha256', getPassword()).update('admin-session-v1').digest('hex')
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(getPassword())
  const provided = Buffer.from(input)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

export async function createAdminSession() {
  const cookieStore = await cookies()
  // In the v0 preview the app renders inside a cross-site iframe. A `lax` cookie
  // is dropped on the cross-site server action requests, so outside production we
  // must use `sameSite: 'none'` (which requires `secure: true`) to keep the session.
  const isProd = process.env.NODE_ENV === 'production'
  cookieStore.set(COOKIE_NAME, expectedToken(), {
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

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value
  if (!value) return false
  const expected = Buffer.from(expectedToken())
  const provided = Buffer.from(value)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
