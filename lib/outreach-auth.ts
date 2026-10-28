import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { getAdminSession } from '@/lib/admin-auth'
import { getLeaderSession } from '@/lib/leader-auth'
import { getCreatorByName } from '@/lib/queries'
import {
  findOutreachLogin,
  getOutreachMemberByCreator,
  getOutreachMemberByLeader,
  getOutreachMemberSecret,
  type OutreachRole,
} from '@/lib/outreach'

const COOKIE_NAME = 'outreach_session'

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

function tokenFor(id: number, passwordHash: string): string {
  const sig = createHmac('sha256', passwordHash)
    .update(`outreach-session-v1:${id}`)
    .digest('hex')
  return `${id}.${sig}`
}

export async function createOutreachSession(member: { id: number; password_hash: string }) {
  const cookieStore = await cookies()
  const isProd = process.env.NODE_ENV === 'production'
  cookieStore.set(COOKIE_NAME, tokenFor(member.id, member.password_hash), {
    httpOnly: true,
    secure: true,
    sameSite: isProd ? 'lax' : 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })
}

export async function destroyOutreachSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getOutreachSession(): Promise<{
  id: number
  name: string
  role: OutreachRole
} | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value
  if (!value) return null
  const id = Number(value.split('.')[0])
  if (!Number.isFinite(id)) return null
  const member = await getOutreachMemberSecret(id)
  if (!member || !safeEqual(tokenFor(member.id, member.password_hash), value)) return null
  return { id: member.id, name: member.name, role: member.role }
}

export type OutreachActor = {
  key: string
  name: string
  role: OutreachRole
  via: 'admin' | 'leader' | 'creator' | 'login'
  creatorHandle: string | null
  canManage: boolean
}

export async function resolveOutreachActor(creatorHandle?: string): Promise<OutreachActor | null> {
  const admin = await getAdminSession()
  if (admin) {
    return {
      key: `admin:${admin.id}`,
      name: admin.name,
      role: 'upper',
      via: 'admin',
      creatorHandle: null,
      canManage: admin.id === 'ahmed',
    }
  }

  const login = await getOutreachSession()
  if (login) {
    return {
      key: `member:${login.id}`,
      name: login.name,
      role: login.role,
      via: 'login',
      creatorHandle: null,
      canManage: false,
    }
  }

  const leader = await getLeaderSession()
  if (leader) {
    const member = await getOutreachMemberByLeader(leader.id)
    if (member) {
      return {
        key: `member:${member.id}`,
        name: member.name,
        role: member.role,
        via: 'leader',
        creatorHandle: null,
        canManage: false,
      }
    }
  }

  const handle = creatorHandle?.trim()
  if (handle) {
    const creator = await getCreatorByName(handle)
    if (!creator) return null
    const member = await getOutreachMemberByCreator(creator.id)
    if (!member) return null
    return {
      key: `member:${member.id}`,
      name: member.name || creator.name,
      role: member.role,
      via: 'creator',
      creatorHandle: handle,
      canManage: false,
    }
  }

  return null
}

export async function loginOutreachMember(name: string, password: string) {
  const member = await findOutreachLogin(name)
  if (!member) return null
  const { verifyPassword } = await import('@/lib/passwords')
  if (!verifyPassword(password, member.password_hash)) return null
  await createOutreachSession(member)
  return member
}
