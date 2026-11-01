import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import { calendarMonthBounds, shiftYearMonth } from '@/lib/biweekly'
import { formatYearMonth } from '@/lib/format'
import { SAR_PER_USD } from '@/lib/fx'
import { getOutflowSnapshot } from '@/lib/outflow'
import { getCommissionBoard, getCommissionEstimate } from '@/lib/commission-data'
import { getLeaderDirectory } from '@/lib/leaders'

/** Amounts in this report are normalised to USD (same as Marketing by month). */
function toUsd(amount: number | null | undefined, currency: 'USD' | 'SAR'): number {
  const n = Number(amount) || 0
  return currency === 'USD' ? n : n / SAR_PER_USD
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type YahyaExpensePerson = {
  key: string
  name: string
  role: string
  /** Monthly amount in USD. */
  monthlyUsd: number
  currency: 'USD' | 'SAR'
  /** Amount in the person's pay currency (null for rolled-up commission). */
  nativeAmount: number | null
}

export type YahyaExpenseCategory = {
  id: 'creators' | 'reposters' | 'commission' | 'leaders' | 'other'
  label: string
  /** Category total in USD. */
  totalUsd: number
  people: YahyaExpensePerson[]
}

export type YahyaOtherExpense = {
  id: number
  yearMonth: string
  label: string
  amount: number
  currency: 'USD' | 'SAR'
  amountUsd: number
  note: string | null
}

export type YahyaExpensesSnapshot = {
  yearMonth: string
  label: string
  from: string
  to: string
  /** Creators + reposters + leaders + other (no commission). */
  payrollUsd: number
  /** Commission earned in this calendar month (in the month bill). */
  commissionUsd: number
  /** Commission already earned in this calendar month. */
  commissionEarnedUsd: number
  /** Full active-deal commission pot (not monthly — planning only). */
  commissionGoingUsd: number
  /** Commission still left to send (did − recorded). */
  commissionPayNowUsd: number
  /** payroll + this month's earned commission. */
  grandTotalUsd: number
  categories: YahyaExpenseCategory[]
  other: YahyaOtherExpense[]
  /** Nearby months for quick jumps. */
  nearbyMonths: { key: string; label: string }[]
}

export async function ensureYahyaExpenseTables() {
  return ensureOnce('yahya_expenses', async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS yahya_other_expenses (
        id SERIAL PRIMARY KEY,
        year_month TEXT NOT NULL,
        label TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'SAR',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS yahya_other_expenses_month_idx
      ON yahya_other_expenses (year_month)
    `
  })
}

export async function listYahyaOtherExpenses(yearMonth: string): Promise<YahyaOtherExpense[]> {
  await ensureYahyaExpenseTables()
  const rows = (await sql`
    SELECT id, year_month, label, amount::float AS amount, currency, note
    FROM yahya_other_expenses
    WHERE year_month = ${yearMonth}
    ORDER BY id ASC
  `) as {
    id: number
    year_month: string
    label: string
    amount: number
    currency: string
    note: string | null
  }[]
  return rows.map((r) => {
    const currency: 'USD' | 'SAR' = r.currency === 'USD' ? 'USD' : 'SAR'
    return {
      id: r.id,
      yearMonth: r.year_month,
      label: r.label,
      amount: Number(r.amount) || 0,
      currency,
      amountUsd: round2(toUsd(r.amount, currency)),
      note: r.note,
    }
  })
}

export async function getYahyaExpensesSnapshot(opts: {
  yearMonth: string
  today: string
}): Promise<YahyaExpensesSnapshot> {
  const yearMonth = /^\d{4}-\d{2}$/.test(opts.yearMonth)
    ? opts.yearMonth
    : opts.today.slice(0, 7)
  const { start: from, end: to } = calendarMonthBounds(yearMonth)
  const today = opts.today

  const [outflow, leadersDir, commissionBoard, commissionEstimate, other] = await Promise.all([
    getOutflowSnapshot({
      from,
      to,
      view: 'total',
      countMode: 'base',
      today: today < to ? today : to,
      includeAllCreators: true,
      includeAllReposters: true,
    }),
    getLeaderDirectory(),
    getCommissionBoard({
      from,
      to,
      today: today < to ? today : to,
      projectId: null,
      role: null,
    }),
    getCommissionEstimate({
      today: today < to ? today : to,
      projectId: null,
      role: null,
    }),
    listYahyaOtherExpenses(yearMonth),
  ])

  const creators: YahyaExpensePerson[] = outflow.peopleTotals
    .filter((p) => p.role !== 'reposter' && p.monthly > 0)
    .map((p) => ({
      key: `creator-${p.creator_id}`,
      name: p.creator_name,
      role: p.role,
      monthlyUsd: round2(p.monthly),
      currency: p.currency,
      nativeAmount:
        p.currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const reposters: YahyaExpensePerson[] = outflow.peopleTotals
    .filter((p) => p.role === 'reposter' && p.monthly > 0)
    .map((p) => ({
      key: `reposter-${p.creator_id}`,
      name: p.creator_name,
      role: 'reposter',
      monthlyUsd: round2(p.monthly),
      currency: p.currency,
      nativeAmount:
        p.currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const leaders: YahyaExpensePerson[] = leadersDir.leaders
    .filter((l) => l.monthlyPay != null && l.monthlyPay > 0)
    .map((l) => {
      const currency = l.payCurrency
      const native = Number(l.monthlyPay) || 0
      return {
        key: `leader-${l.id}`,
        name: l.name,
        role: l.level || 'leader',
        monthlyUsd: round2(toUsd(native, currency)),
        currency,
        nativeAmount: round2(native),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Commission settings / board are SAR.
  const commissionEarnedUsd = round2(toUsd(commissionBoard.totals.commissionEarned, 'SAR'))
  const commissionGoingUsd = round2(toUsd(commissionEstimate.estimate.goingToDo, 'SAR'))
  const commissionPayNowUsd = round2(toUsd(commissionEstimate.estimate.payNow, 'SAR'))
  // Month bill uses what was earned this calendar month. Deal-wide estimate stays separate.
  const commissionUsd = commissionEarnedUsd

  const commissionPeople: YahyaExpensePerson[] = commissionBoard.rows
    .filter((r) => r.commissionEarned > 0)
    .map((r) => ({
      key: `commission-${r.creatorId}`,
      name: r.name,
      role: r.role,
      monthlyUsd: round2(toUsd(r.commissionEarned, 'SAR')),
      currency: 'SAR' as const,
      nativeAmount: round2(r.commissionEarned),
    }))
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd)

  const otherPeople: YahyaExpensePerson[] = other.map((o) => ({
    key: `other-${o.id}`,
    name: o.label,
    role: 'other',
    monthlyUsd: o.amountUsd,
    currency: o.currency,
    nativeAmount: o.amount,
  }))

  const sumPeople = (people: YahyaExpensePerson[]) =>
    round2(people.reduce((s, p) => s + p.monthlyUsd, 0))

  const categories: YahyaExpenseCategory[] = [
    {
      id: 'creators',
      label: 'Creators (base)',
      totalUsd: sumPeople(creators),
      people: creators,
    },
    {
      id: 'commission',
      label: 'Commission',
      totalUsd: commissionUsd,
      people: commissionPeople,
    },
    {
      id: 'reposters',
      label: 'Reposters',
      totalUsd: sumPeople(reposters),
      people: reposters,
    },
    {
      id: 'leaders',
      label: 'Leaders / management',
      totalUsd: sumPeople(leaders),
      people: leaders,
    },
    {
      id: 'other',
      label: 'Other (subscriptions…)',
      totalUsd: sumPeople(otherPeople),
      people: otherPeople,
    },
  ]

  const payrollUsd = round2(
    categories
      .filter((c) => c.id !== 'commission')
      .reduce((s, c) => s + c.totalUsd, 0),
  )
  const grandTotalUsd = round2(payrollUsd + commissionUsd)

  const nearbyMonths = [-2, -1, 0, 1, 2].map((delta) => {
    const key = shiftYearMonth(yearMonth, delta)
    return { key, label: formatYearMonth(key) }
  })

  return {
    yearMonth,
    label: formatYearMonth(yearMonth),
    from,
    to,
    payrollUsd,
    commissionUsd,
    commissionEarnedUsd,
    commissionGoingUsd,
    commissionPayNowUsd,
    grandTotalUsd,
    categories,
    other,
    nearbyMonths,
  }
}

export async function addYahyaOtherExpense(input: {
  yearMonth: string
  label: string
  amount: number
  currency: 'USD' | 'SAR'
  note?: string | null
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  const label = input.label.trim()
  if (!label) return { ok: false, error: 'Label required' }
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) return { ok: false, error: 'Bad month' }
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Amount must be > 0' }
  const currency = input.currency === 'USD' ? 'USD' : 'SAR'
  const rows = (await sql`
    INSERT INTO yahya_other_expenses (year_month, label, amount, currency, note)
    VALUES (${input.yearMonth}, ${label}, ${amount}, ${currency}, ${input.note?.trim() || null})
    RETURNING id
  `) as { id: number }[]
  return { ok: true, id: rows[0]?.id ?? 0 }
}

export async function deleteYahyaOtherExpense(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Bad id' }
  await sql`DELETE FROM yahya_other_expenses WHERE id = ${id}`
  return { ok: true }
}
