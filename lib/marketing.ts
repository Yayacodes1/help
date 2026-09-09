import 'server-only'
import { sql } from '@/lib/db'

export type MarketingCurrency = 'USD' | 'SAR'

export type MarketingTransfer = {
  id: number
  sent_on: string
  amount: number
  currency: MarketingCurrency
  label: string | null
  note: string | null
  created_at: string
}

export type MarketingExpense = {
  id: number
  spent_on: string
  amount: number
  currency: MarketingCurrency
  label: string
  note: string | null
  created_at: string
}

export type MarketingRequest = {
  id: number
  needed_by: string | null
  currency: MarketingCurrency
  status: 'open' | 'fulfilled' | 'cancelled'
  title: string | null
  note: string | null
  created_at: string
  total_amount: number
}

export type MarketingRequestItem = {
  id: number
  request_id: number
  amount: number
  reason: string
}

export type MarketingBalance = {
  currency: MarketingCurrency
  sent: number
  spent: number
  left: number
}

/** Idempotent marketing tables. */
export async function ensureMarketingTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_transfers (
      id SERIAL PRIMARY KEY,
      sent_on DATE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      label TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_expenses (
      id SERIAL PRIMARY KEY,
      spent_on DATE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      label TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_requests (
      id SERIAL PRIMARY KEY,
      needed_by DATE,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'open',
      title TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_request_items (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES marketing_requests(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      reason TEXT NOT NULL
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS marketing_transfers_sent_on_idx ON marketing_transfers (sent_on)`
  await sql`CREATE INDEX IF NOT EXISTS marketing_expenses_spent_on_idx ON marketing_expenses (spent_on)`
  await sql`CREATE INDEX IF NOT EXISTS marketing_requests_status_idx ON marketing_requests (status)`
}

export function normalizeCurrency(value: string | null | undefined): MarketingCurrency {
  return value === 'SAR' ? 'SAR' : 'USD'
}

export async function getMarketingBalances(): Promise<MarketingBalance[]> {
  const rows = (await sql`
    WITH currencies AS (
      SELECT DISTINCT currency FROM marketing_transfers
      UNION
      SELECT DISTINCT currency FROM marketing_expenses
    )
    SELECT
      c.currency,
      COALESCE((SELECT SUM(t.amount) FROM marketing_transfers t WHERE t.currency = c.currency), 0)::float AS sent,
      COALESCE((SELECT SUM(e.amount) FROM marketing_expenses e WHERE e.currency = c.currency), 0)::float AS spent
    FROM currencies c
    ORDER BY c.currency ASC
  `) as { currency: string; sent: number; spent: number }[]

  return rows.map((r) => {
    const currency = normalizeCurrency(r.currency)
    const sent = Number(r.sent) || 0
    const spent = Number(r.spent) || 0
    return { currency, sent, spent, left: sent - spent }
  })
}

export async function listMarketingTransfers(): Promise<MarketingTransfer[]> {
  return (await sql`
    SELECT id, sent_on::text AS sent_on, amount::float AS amount, currency,
           label, note, created_at
    FROM marketing_transfers
    ORDER BY sent_on DESC, id DESC
  `) as MarketingTransfer[]
}

export async function listMarketingExpenses(): Promise<MarketingExpense[]> {
  return (await sql`
    SELECT id, spent_on::text AS spent_on, amount::float AS amount, currency,
           label, note, created_at
    FROM marketing_expenses
    ORDER BY spent_on DESC, id DESC
  `) as MarketingExpense[]
}

export async function listMarketingRequests(
  status?: 'open' | 'fulfilled' | 'cancelled' | null,
): Promise<(MarketingRequest & { items: MarketingRequestItem[] })[]> {
  const statusFilter = status ?? null
  const requests = (await sql`
    SELECT r.id, r.needed_by::text AS needed_by, r.currency, r.status, r.title, r.note, r.created_at,
           COALESCE((SELECT SUM(i.amount) FROM marketing_request_items i WHERE i.request_id = r.id), 0)::float AS total_amount
    FROM marketing_requests r
    WHERE (${statusFilter}::text IS NULL OR r.status = ${statusFilter})
    ORDER BY
      CASE r.status WHEN 'open' THEN 0 WHEN 'fulfilled' THEN 1 ELSE 2 END,
      r.needed_by ASC NULLS LAST,
      r.id DESC
  `) as MarketingRequest[]

  if (requests.length === 0) return []

  const items = (await sql`
    SELECT id, request_id, amount::float AS amount, reason
    FROM marketing_request_items
    ORDER BY id ASC
  `) as MarketingRequestItem[]

  const idSet = new Set(requests.map((r) => r.id))
  const byRequest = new Map<number, MarketingRequestItem[]>()
  for (const item of items) {
    if (!idSet.has(item.request_id)) continue
    const list = byRequest.get(item.request_id) ?? []
    list.push(item)
    byRequest.set(item.request_id, list)
  }

  return requests.map((r) => ({ ...r, items: byRequest.get(r.id) ?? [] }))
}
