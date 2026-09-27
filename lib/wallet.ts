import 'server-only'
import { sql } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { normalizeCurrency, type MarketingCurrency } from '@/lib/marketing'

/**
 * "Ahmed's wallet": money Yahya sends Ahmed (marketing_transfers) minus what Ahmed pays
 * creators (payments.paid_by = 'ahmed') and other spend (marketing_expenses).
 */
export type WalletTotals = {
  currency: MarketingCurrency
  sent: number
  spentPayments: number
  spentOther: number
  left: number
  /** Open money requests not sent yet. */
  waiting: number
}

export type WalletEntry = {
  key: string
  kind: 'in' | 'pay' | 'spend'
  id: number
  date: string
  amount: number
  currency: MarketingCurrency
  label: string
  note: string | null
  recordedBy: string | null
  creatorId: number | null
}

export type WalletPerson = { id: number; name: string; role: 'creator' | 'reposter' }

export async function getWalletTotals(): Promise<WalletTotals[]> {
  const rows = (await sql`
    WITH cur AS (
      SELECT 'USD'::text AS currency
      UNION SELECT DISTINCT currency FROM marketing_transfers
      UNION SELECT DISTINCT currency FROM marketing_expenses
    )
    SELECT
      c.currency,
      COALESCE((SELECT SUM(amount) FROM marketing_transfers WHERE currency = c.currency), 0)::float AS sent,
      COALESCE((SELECT SUM(amount) FROM marketing_expenses WHERE currency = c.currency), 0)::float AS spent_other,
      (CASE WHEN c.currency = 'USD'
        THEN COALESCE((SELECT SUM(amount) FROM payments WHERE paid_by = 'ahmed'), 0)
        ELSE 0 END)::float AS spent_payments,
      COALESCE((
        SELECT SUM(i.amount) FROM marketing_request_items i
        JOIN marketing_requests r ON r.id = i.request_id
        WHERE r.status = 'open' AND r.currency = c.currency
      ), 0)::float AS waiting
    FROM cur c
  `) as { currency: string; sent: number; spent_other: number; spent_payments: number; waiting: number }[]

  return rows
    .map((r) => {
      const sent = Number(r.sent) || 0
      const spentOther = Number(r.spent_other) || 0
      const spentPayments = Number(r.spent_payments) || 0
      return {
        currency: normalizeCurrency(r.currency),
        sent,
        spentOther,
        spentPayments,
        left: sent - spentOther - spentPayments,
        waiting: Number(r.waiting) || 0,
      }
    })
    .filter((t) => t.currency === 'USD' || t.sent || t.spentOther || t.waiting)
    .sort((a, b) => (a.currency === 'USD' ? -1 : b.currency === 'USD' ? 1 : 0))
}

export async function getWalletEntries(limit = 400): Promise<WalletEntry[]> {
  const rows = (await sql`
    SELECT * FROM (
      SELECT 'in' AS kind, t.id, t.sent_on::text AS date, t.amount::float AS amount, t.currency,
             COALESCE(t.label, 'Money sent to Ahmed') AS label, t.note, t.recorded_by,
             NULL::int AS creator_id, t.created_at
      FROM marketing_transfers t
      UNION ALL
      SELECT 'spend', e.id, e.spent_on::text, e.amount::float, e.currency,
             e.label, e.note, e.recorded_by, NULL::int, e.created_at
      FROM marketing_expenses e
      UNION ALL
      SELECT 'pay', p.id, p.paid_on::text, p.amount::float, 'USD',
             'Paid ' || c.name, p.note, p.recorded_by, p.creator_id, p.created_at
      FROM payments p
      JOIN creators c ON c.id = p.creator_id
      WHERE p.paid_by = 'ahmed'
    ) x
    ORDER BY date DESC, created_at DESC, id DESC
    LIMIT ${limit}
  `) as Array<{
    kind: 'in' | 'pay' | 'spend'
    id: number
    date: string
    amount: number
    currency: string
    label: string
    note: string | null
    recorded_by: string | null
    creator_id: number | null
  }>
  return rows.map((r) => ({
    key: `${r.kind}-${r.id}`,
    kind: r.kind,
    id: r.id,
    date: r.date,
    amount: Number(r.amount) || 0,
    currency: normalizeCurrency(r.currency),
    label: r.label,
    note: r.note,
    recordedBy: r.recorded_by,
    creatorId: r.creator_id,
  }))
}

/** Everyone who can be paid (not paused), reposters first. */
export async function getPayablePeople(): Promise<WalletPerson[]> {
  return (await sql`
    SELECT id, name, CASE WHEN role = 'reposter' THEN 'reposter' ELSE 'creator' END AS role
    FROM creators
    WHERE paused_at IS NULL
    ORDER BY (role = 'reposter') DESC, name ASC
  `) as WalletPerson[]
}

/**
 * Who paid and who recorded it. Ahmed's payments always come out of his wallet.
 * Yahya's do too unless `paid_from` is 'direct' (he paid them himself).
 */
export async function paymentSource(
  paidFrom?: FormDataEntryValue | string | null,
): Promise<{ paidBy: 'ahmed' | null; recordedBy: string | null }> {
  const session = await getAdminSession()
  if (!session) return { paidBy: null, recordedBy: null }
  if (session.role === 'manager') return { paidBy: 'ahmed', recordedBy: session.id }
  return { paidBy: paidFrom?.toString() === 'direct' ? null : 'ahmed', recordedBy: session.id }
}
