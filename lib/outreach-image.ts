import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

function imageSecret(): string {
  return (
    process.env.TOOL_APPROVAL_SECRET ||
    process.env.ADMIN_PASSWORD_AHMED ||
    process.env.ADMIN_PASSWORD_YAHYA ||
    'outreach-image'
  )
}

export function leadImageToken(id: number, kind: 'account' | 'chat'): string {
  return createHmac('sha256', imageSecret()).update(`lead-image:${id}:${kind}`).digest('hex')
}

export function leadImageUrl(id: number, kind: 'account' | 'chat'): string {
  const token = leadImageToken(id, kind)
  return `/api/outreach/lead-image?id=${id}&kind=${kind}&token=${token}`
}

export function validLeadImageToken(id: number, kind: 'account' | 'chat', token: string): boolean {
  const expected = leadImageToken(id, kind)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
