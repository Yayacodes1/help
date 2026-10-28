import 'server-only'
import { sql } from '@/lib/db'

const QUOTA_NAME = 'tikhub'
const MIN_GAP_MS = 500
const LOCAL_LIMIT = 2
const GLOBAL_LIMIT = 2

let memoryBlockedUntil = 0
let lastStartedAt = 0
let inflight = 0
const waiters: Array<() => void> = []

async function ensureQuotaTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS tikhub_quota (
      name TEXT PRIMARY KEY,
      blocked_until TIMESTAMPTZ,
      inflight INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE tikhub_quota ADD COLUMN IF NOT EXISTS inflight integer NOT NULL DEFAULT 0`
}

export async function readTikHubBlockedUntil(): Promise<number> {
  try {
    await ensureQuotaTable()
    const rows = (await sql`
      SELECT blocked_until FROM tikhub_quota WHERE name = ${QUOTA_NAME} LIMIT 1
    `) as { blocked_until: string | null }[]
    const ts = rows[0]?.blocked_until ? new Date(rows[0].blocked_until).getTime() : 0
    if (Number.isFinite(ts) && ts > memoryBlockedUntil) memoryBlockedUntil = ts
  } catch {
    /* in-memory only */
  }
  return memoryBlockedUntil
}

export async function blockTikHubQuota(ms: number): Promise<void> {
  const until = Date.now() + Math.min(60_000, Math.max(1_000, ms))
  memoryBlockedUntil = Math.max(memoryBlockedUntil, until)
  try {
    await ensureQuotaTable()
    await sql`
      INSERT INTO tikhub_quota (name, blocked_until, updated_at)
      VALUES (${QUOTA_NAME}, ${new Date(until).toISOString()}::timestamptz, NOW())
      ON CONFLICT (name) DO UPDATE
      SET blocked_until = GREATEST(COALESCE(tikhub_quota.blocked_until, EXCLUDED.blocked_until), EXCLUDED.blocked_until),
          updated_at = NOW()
    `
  } catch {
    /* in-memory still holds */
  }
}

function takeLocalSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryStart = () => {
      if (inflight >= LOCAL_LIMIT) {
        waiters.push(tryStart)
        return
      }
      const wait = Math.max(0, lastStartedAt + MIN_GAP_MS - Date.now())
      inflight += 1
      if (wait > 0) {
        setTimeout(() => {
          lastStartedAt = Date.now()
          resolve()
        }, wait)
      } else {
        lastStartedAt = Date.now()
        resolve()
      }
    }
    tryStart()
  })
}

function releaseLocalSlot() {
  inflight = Math.max(0, inflight - 1)
  const next = waiters.shift()
  if (next) next()
}

export type QuotaGate = { ok: true } | { ok: false; retryAfterMs: number }

async function tryIncrementInflight(): Promise<boolean> {
  try {
    await ensureQuotaTable()
    await sql`
      UPDATE tikhub_quota
      SET inflight = 0, updated_at = NOW()
      WHERE name = ${QUOTA_NAME}
        AND inflight > 0
        AND updated_at < NOW() - INTERVAL '30 seconds'
    `
    const rows = (await sql`
      INSERT INTO tikhub_quota (name, inflight, updated_at)
      VALUES (${QUOTA_NAME}, 1, NOW())
      ON CONFLICT (name) DO UPDATE
      SET inflight = tikhub_quota.inflight + 1,
          updated_at = NOW()
      WHERE tikhub_quota.inflight < ${GLOBAL_LIMIT}
      RETURNING inflight
    `) as { inflight: number }[]
    return rows.length > 0
  } catch {
    return true
  }
}

async function decrementInflight() {
  try {
    await sql`
      UPDATE tikhub_quota
      SET inflight = GREATEST(inflight - 1, 0), updated_at = NOW()
      WHERE name = ${QUOTA_NAME}
    `
  } catch {
    /* local slot still released */
  }
}

/** Shared TikHub credential gate. Wait is for short pauses only; longer 429s return wait. */
export async function acquireTikHubQuota(): Promise<QuotaGate> {
  const until = await readTikHubBlockedUntil()
  const remaining = until - Date.now()
  if (remaining > 2_000) {
    return { ok: false, retryAfterMs: remaining }
  }
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining))
  }
  await takeLocalSlot()
  const got = await tryIncrementInflight()
  if (!got) {
    releaseLocalSlot()
    return { ok: false, retryAfterMs: 1_500 }
  }
  return { ok: true }
}

export function releaseTikHubQuota() {
  void decrementInflight()
  releaseLocalSlot()
}
