import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEY_LEN = 32

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split(':')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const next = scryptSync(password, salt, KEY_LEN)
  const prev = Buffer.from(hash, 'hex')
  if (next.length !== prev.length) return false
  return timingSafeEqual(next, prev)
}
