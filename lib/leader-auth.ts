import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { getLeaderSecret } from '@/lib/leaders'

const COOKIE_NAME = 'leader_session'

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

function tokenFor(id: number, passwordHash: string): string {
  const sig = createHmac('sha256', passwordHash)
    .update(`leader-session-v1:${id}`)
    .digest('hex')
  return `${id}.${sig}`
}

export type LeaderSession = { id: number; name: string }

export async function createLeaderSession(leader: { id: number; password_hash: string }) {
  const cookieStore = await cookies()
  const isProd = process.env.NODE_ENV === 'production'
  cookieStore.set(COOKIE_NAME, tokenFor(leader.id, leader.password_hash), {
    httpOnly: true,
    secure: true,
    sameSite: isProd ? 'lax' : 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })
}

export async function destroyLeaderSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getLeaderSession(): Promise<LeaderSession | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value
  if (!value) return null
  const id = Number(value.split('.')[0])
  if (!Number.isFinite(id)) return null
  const leader = await getLeaderSecret(id)
  if (!leader || !safeEqual(tokenFor(leader.id, leader.password_hash), value)) return null
  return { id: leader.id, name: leader.name }
}
