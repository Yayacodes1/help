import 'server-only'
import { sql, type Contract } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { normalizeCurrency, type MarketingCurrency } from '@/lib/marketing'
import { payCurrency } from '@/lib/format'
import { SAR_PER_USD, usdToSar } from '@/lib/fx'
import { minimumContractDue } from '@/lib/queries'

/**
 * "Ahmed's wallet": money Yahya sends Ahmed (marketing_transfers) minus what Ahmed pays
 * creators (payments.paid_by = 'ahmed') and other spend (marketing_expenses).
 * wallet_adjustments line it up with what Ahmed says he actually has.
 * Everything is totalled in SAR; USD amounts convert at SAR_PER_USD.
 */
export type WalletTotals = {
  currency: 'SAR'
  sent: number
  /** Net of Ahmed's balance corrections (+ he had more, − he had less). */
  adjusted: number
  spentPayments: number
  spentOther: number
  left: number
  /** Ahmed's latest "I have X" count, if any. */
  lastCount: { amount: number; on: string; by: string | null } | null
  /** Open money requests not sent yet. */
  waiting: number
}

export type WalletEntry = {
  key: string
  kind: 'in' | 'pay' | 'spend' | 'adjust'
  id: number
  date: string
  /** In the currency it was logged in. */
  amount: number
  currency: MarketingCurrency
  /** Same amount in SAR. */
  sar: number
  label: string
  note: string | null
  recordedBy: string | null
  creatorId: number | null
  /** For payments: the contract the payment was put against. */
  contractName: string | null
}

/** A person's current contract (or latest past one) and what was paid against it. */
export type WalletContract = {
  id: number
  name: string
  startDate: string
  endDate: string | null
  /** Base (+ flat commission) agreed for the whole contract, in the person's currency. */
  agreed: number
  paid: number
  payments: number
  lastPaidOn: string | null
  active: boolean
}

export type WalletPerson = {
  id: number
  name: string
  role: 'creator' | 'reposter'
  pay_currency: string | null
  currency: 'USD' | 'SAR'
  contract: WalletContract | null
}

const toSar = (amount: number, currency: string) =>
  currency === 'USD' ? usdToSar(amount) : Math.round(amount * 100) / 100

export async function getWalletTotals(): Promise<WalletTotals> {
  const fx = SAR_PER_USD
  const rows = (await sql`
    SELECT
      COALESCE((
        SELECT SUM(CASE WHEN currency = 'USD' THEN amount * ${fx} ELSE amount END) FROM marketing_transfers
      ), 0)::float AS sent,
      COALESCE((
        SELECT SUM(CASE WHEN currency = 'USD' THEN amount * ${fx} ELSE amount END) FROM marketing_expenses
      ), 0)::float AS spent_other,
      COALESCE((
        SELECT SUM(CASE WHEN currency = 'USD' THEN amount * ${fx} ELSE amount END) FROM wallet_adjustments
      ), 0)::float AS adjusted,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN c.pay_currency = 'USD' OR (c.pay_currency IS DISTINCT FROM 'SAR' AND c.role = 'reposter')
              THEN p.amount * ${fx}
            ELSE p.amount
          END)
        FROM payments p
        JOIN creators c ON c.id = p.creator_id
        WHERE p.paid_by = 'ahmed'
      ), 0)::float AS spent_payments,
      COALESCE((
        SELECT SUM(CASE WHEN r.currency = 'USD' THEN i.amount * ${fx} ELSE i.amount END)
        FROM marketing_request_items i
        JOIN marketing_requests r ON r.id = i.request_id
        WHERE r.status = 'open'
      ), 0)::float AS waiting,
      lc.counted::float AS last_counted,
      lc.currency AS last_counted_currency,
      lc.adjusted_on::text AS last_counted_on,
      lc.recorded_by AS last_counted_by
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
      SELECT counted, currency, adjusted_on, recorded_by FROM wallet_adjustments
      ORDER BY adjusted_on DESC, id DESC
      LIMIT 1
    ) lc ON TRUE
  `) as {
    sent: number
    adjusted: number
    spent_other: number
    spent_payments: number
    waiting: number
    last_counted: number | null
    last_counted_currency: string | null
    last_counted_on: string | null
    last_counted_by: string | null
  }[]
  const r = rows[0]
  const round = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
  const sent = round(r?.sent)
  const spentOther = round(r?.spent_other)
  const spentPayments = round(r?.spent_payments)
  const adjusted = round(r?.adjusted)
  return {
    currency: 'SAR',
    sent,
    adjusted,
    spentOther,
    spentPayments,
    left: round(sent + adjusted - spentOther - spentPayments),
    waiting: round(r?.waiting),
    lastCount:
      r?.last_counted != null && r.last_counted_on
        ? {
            amount: toSar(Number(r.last_counted), r.last_counted_currency ?? 'SAR'),
            on: r.last_counted_on,
            by: r.last_counted_by,
          }
        : null,
  }
}

export async function getWalletEntries(limit = 400): Promise<WalletEntry[]> {
  const rows = (await sql`
    SELECT * FROM (
      SELECT 'in' AS kind, t.id, t.sent_on::text AS date, t.amount::float AS amount, t.currency,
             COALESCE(t.label, 'Money sent to Ahmed') AS label, t.note, t.recorded_by,
             NULL::int AS creator_id, NULL::text AS contract_name, t.created_at
      FROM marketing_transfers t
      UNION ALL
      SELECT 'spend', e.id, e.spent_on::text, e.amount::float, e.currency,
             e.label, e.note, e.recorded_by, NULL::int, NULL::text, e.created_at
      FROM marketing_expenses e
      UNION ALL
      SELECT 'adjust', a.id, a.adjusted_on::text, a.amount::float, a.currency,
             'Ahmed’s count: has ' || to_char(a.counted, 'FM999,999,990.00') || ' ' || a.currency,
             a.note, a.recorded_by, NULL::int, NULL::text, a.created_at
      FROM wallet_adjustments a
      UNION ALL
      SELECT 'pay', p.id, p.paid_on::text, p.amount::float,
             CASE
               WHEN c.pay_currency IN ('USD', 'SAR') THEN c.pay_currency
               WHEN c.role = 'reposter' THEN 'USD'
               ELSE 'SAR'
             END,
             'Paid ' || c.name, p.note, p.recorded_by, p.creator_id, k.name, p.created_at
      FROM payments p
      JOIN creators c ON c.id = p.creator_id
      LEFT JOIN contracts k ON k.id = p.contract_id
      WHERE p.paid_by = 'ahmed'
    ) x
    ORDER BY date DESC, created_at DESC, id DESC
    LIMIT ${limit}
  `) as Array<{
    kind: 'in' | 'pay' | 'spend' | 'adjust'
    id: number
    date: string
    amount: number
    currency: string
    label: string
    note: string | null
    recorded_by: string | null
    creator_id: number | null
    contract_name: string | null
  }>
  return rows.map((r) => {
    const amount = Number(r.amount) || 0
    const currency = normalizeCurrency(r.currency)
    return {
      key: `${r.kind}-${r.id}`,
      kind: r.kind,
      id: r.id,
      date: r.date,
      amount,
      currency,
      sar: toSar(amount, currency),
      label: r.label,
      note: r.note,
      recordedBy: r.recorded_by,
      creatorId: r.creator_id,
      contractName: r.contract_name,
    }
  })
}

/** Everyone who can be paid (not paused), reposters first, each with their current contract. */
export async function getPayablePeople(today: string): Promise<WalletPerson[]> {
  const [peopleRows, contractRows] = await Promise.all([
    sql`
      SELECT id, name, CASE WHEN role = 'reposter' THEN 'reposter' ELSE 'creator' END AS role, pay_currency
      FROM creators
      WHERE paused_at IS NULL
      ORDER BY (role = 'reposter') DESC, name ASC
    `,
    sql`
      SELECT DISTINCT ON (k.creator_id)
             k.id, k.creator_id, k.name,
             k.start_date::text AS start_date,
             k.end_date::text AS end_date,
             k.base_amount::float AS base_amount,
             COALESCE(NULLIF(k.base_pay_cadence, ''), 'monthly') AS base_pay_cadence,
             k.commission_amount::float AS commission_amount,
             (k.end_date IS NULL OR k.end_date >= ${today}::date) AS active,
             COALESCE(pay.total, 0)::float AS paid,
             COALESCE(pay.n, 0)::int AS payments,
             pay.last::text AS last_paid_on
      FROM contracts k
      JOIN creators c ON c.id = k.creator_id AND c.paused_at IS NULL
      LEFT JOIN LATERAL (
        SELECT SUM(amount) AS total, COUNT(*) AS n, MAX(paid_on) AS last
        FROM payments WHERE contract_id = k.id
      ) pay ON TRUE
      WHERE k.start_date <= ${today}::date
      ORDER BY k.creator_id, (k.end_date IS NULL OR k.end_date >= ${today}::date) DESC, k.start_date DESC, k.id DESC
    `,
  ])
  const contracts = new Map(
    (
      contractRows as Array<
        Pick<Contract, 'id' | 'creator_id' | 'name' | 'start_date' | 'end_date' | 'base_amount' | 'base_pay_cadence' | 'commission_amount'> & {
          active: boolean
          paid: number
          payments: number
          last_paid_on: string | null
        }
      >
    ).map((k) => [
      k.creator_id,
      {
        id: k.id,
        name: k.name,
        startDate: k.start_date,
        endDate: k.end_date,
        agreed: minimumContractDue(k),
        paid: Number(k.paid) || 0,
        payments: Number(k.payments) || 0,
        lastPaidOn: k.last_paid_on,
        active: k.active,
      } satisfies WalletContract,
    ]),
  )
  return (peopleRows as Omit<WalletPerson, 'currency' | 'contract'>[]).map((p) => ({
    ...p,
    currency: payCurrency(p.role, p.pay_currency),
    contract: contracts.get(p.id) ?? null,
  }))
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
