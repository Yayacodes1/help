import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import { calendarMonthBounds, shiftYearMonth } from '@/lib/biweekly'
import { formatYearMonth } from '@/lib/format'
import { SAR_PER_USD } from '@/lib/fx'
import { getOutflowSnapshot } from '@/lib/outflow'
import { getLeaderDirectory } from '@/lib/leaders'

/** Amounts in this report are normalised to USD (same as Marketing by month). */
function toUsd(amount: number | null | undefined, currency: 'USD' | 'SAR'): number {
  const n = Number(amount) || 0
  return currency === 'USD' ? n : n / SAR_PER_USD
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type YahyaPlacement = 'leaders' | 'reposters' | 'both'

export type YahyaCategoryId = 'creators' | 'reposters' | 'leaders' | 'other'

export type YahyaExpensePerson = {
  key: string
  name: string
  role: string
  categoryId: YahyaCategoryId
  /** Monthly amount in USD. */
  monthlyUsd: number
  currency: 'USD' | 'SAR'
  /** Monthly amount in the person's pay currency. */
  nativeMonthly: number
  creatorId: number | null
  leaderId: number | null
  otherId: number | null
  /** True when this month has a page-only override. */
  pageOverride: boolean
  /** Dual-role: linked as a reposter or leader elsewhere. */
  also: null | {
    kind: 'reposter' | 'leader'
    label: string
    creatorId: number | null
    leaderId: number | null
  }
  /** Where dual-role people count on this page. */
  placement: YahyaPlacement | null
}

export type YahyaExpenseCategory = {
  id: YahyaCategoryId
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
  /** Creators + reposters + leaders + other. */
  grandTotalUsd: number
  categories: YahyaExpenseCategory[]
  other: YahyaOtherExpense[]
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
    await sql`
      CREATE TABLE IF NOT EXISTS yahya_expense_overrides (
        year_month TEXT NOT NULL,
        person_key TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'SAR',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (year_month, person_key)
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS yahya_expense_placements (
        person_key TEXT PRIMARY KEY,
        placement TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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

async function listOverrides(yearMonth: string) {
  await ensureYahyaExpenseTables()
  const rows = (await sql`
    SELECT person_key, amount::float AS amount, currency
    FROM yahya_expense_overrides
    WHERE year_month = ${yearMonth}
  `) as { person_key: string; amount: number; currency: string }[]
  return new Map(
    rows.map((r) => [
      r.person_key,
      {
        amount: Number(r.amount) || 0,
        currency: (r.currency === 'USD' ? 'USD' : 'SAR') as 'USD' | 'SAR',
      },
    ]),
  )
}

async function listPlacements() {
  await ensureYahyaExpenseTables()
  const rows = (await sql`
    SELECT person_key, placement FROM yahya_expense_placements
  `) as { person_key: string; placement: string }[]
  const map = new Map<string, YahyaPlacement>()
  for (const r of rows) {
    if (r.placement === 'leaders' || r.placement === 'reposters' || r.placement === 'both') {
      map.set(r.person_key, r.placement)
    }
  }
  return map
}

function applyOverride(
  personKey: string,
  base: { monthlyUsd: number; currency: 'USD' | 'SAR'; nativeMonthly: number },
  overrides: Map<string, { amount: number; currency: 'USD' | 'SAR' }>,
): { monthlyUsd: number; currency: 'USD' | 'SAR'; nativeMonthly: number; pageOverride: boolean } {
  const o = overrides.get(personKey)
  if (!o) return { ...base, pageOverride: false }
  return {
    currency: o.currency,
    nativeMonthly: round2(o.amount),
    monthlyUsd: round2(toUsd(o.amount, o.currency)),
    pageOverride: true,
  }
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

  const [outflow, leadersDir, other, overrides, placements] = await Promise.all([
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
    listYahyaOtherExpenses(yearMonth),
    listOverrides(yearMonth),
    listPlacements(),
  ])

  const dualLeaders = leadersDir.leaders.filter(
    (l) => l.reposterId != null && l.monthlyPay != null && l.monthlyPay > 0,
  )
  const dualByReposterId = new Map(
    dualLeaders.map((l) => [
      l.reposterId!,
      {
        leaderId: l.id,
        leaderName: l.name,
        key: `leader-${l.id}`,
      },
    ]),
  )
  const dualByLeaderId = new Map(
    dualLeaders.map((l) => [
      l.id,
      {
        reposterId: l.reposterId!,
        reposterName: l.reposterName ?? 'reposter',
        key: `leader-${l.id}`,
      },
    ]),
  )

  function placementFor(leaderKey: string): YahyaPlacement {
    return placements.get(leaderKey) ?? 'leaders'
  }

  const creators: YahyaExpensePerson[] = outflow.peopleTotals
    .filter((p) => p.role !== 'reposter' && p.monthly > 0)
    .map((p) => {
      const key = `creator-${p.creator_id}`
      const currency = p.currency
      const nativeMonthly =
        currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD)
      const paid = applyOverride(
        key,
        { monthlyUsd: round2(p.monthly), currency, nativeMonthly },
        overrides,
      )
      return {
        key,
        name: p.creator_name,
        role: 'creator',
        categoryId: 'creators' as const,
        creatorId: p.creator_id,
        leaderId: null,
        otherId: null,
        also: null,
        placement: null,
        ...paid,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const reposterRows = outflow.peopleTotals.filter((p) => p.role === 'reposter' && p.monthly > 0)
  const reposters: YahyaExpensePerson[] = []
  for (const p of reposterRows) {
    const dual = dualByReposterId.get(p.creator_id)
    const place = dual ? placementFor(dual.key) : null
    if (dual && place === 'leaders') continue

    const key = `reposter-${p.creator_id}`
    const currency = p.currency
    const nativeMonthly =
      currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD)
    const paid = applyOverride(
      key,
      { monthlyUsd: round2(p.monthly), currency, nativeMonthly },
      overrides,
    )
    reposters.push({
      key,
      name: p.creator_name,
      role: 'reposter',
      categoryId: 'reposters',
      creatorId: p.creator_id,
      leaderId: dual?.leaderId ?? null,
      otherId: null,
      also: dual
        ? {
            kind: 'leader',
            label: dual.leaderName,
            creatorId: p.creator_id,
            leaderId: dual.leaderId,
          }
        : null,
      placement: place,
      ...paid,
    })
  }
  reposters.sort((a, b) => a.name.localeCompare(b.name))

  const leaders: YahyaExpensePerson[] = []
  for (const l of leadersDir.leaders) {
    if (l.monthlyPay == null || l.monthlyPay <= 0) continue
    const dual = dualByLeaderId.get(l.id)
    const place = dual ? placementFor(`leader-${l.id}`) : null
    if (dual && place === 'reposters') continue

    const key = `leader-${l.id}`
    const currency = l.payCurrency
    const native = Number(l.monthlyPay) || 0
    const paid = applyOverride(
      key,
      {
        monthlyUsd: round2(toUsd(native, currency)),
        currency,
        nativeMonthly: round2(native),
      },
      overrides,
    )
    leaders.push({
      key,
      name: l.name,
      role: l.level || 'leader',
      categoryId: 'leaders',
      creatorId: l.reposterId,
      leaderId: l.id,
      otherId: null,
      also: dual
        ? {
            kind: 'reposter',
            label: dual.reposterName,
            creatorId: dual.reposterId,
            leaderId: l.id,
          }
        : null,
      placement: place,
      ...paid,
    })
  }
  leaders.sort((a, b) => a.name.localeCompare(b.name))

  const otherPeople: YahyaExpensePerson[] = other.map((o) => ({
    key: `other-${o.id}`,
    name: o.label,
    role: 'other',
    categoryId: 'other' as const,
    monthlyUsd: o.amountUsd,
    currency: o.currency,
    nativeMonthly: o.amount,
    creatorId: null,
    leaderId: null,
    otherId: o.id,
    pageOverride: false,
    also: null,
    placement: null,
  }))

  const sumPeople = (people: YahyaExpensePerson[]) =>
    round2(people.reduce((s, p) => s + p.monthlyUsd, 0))

  const categories: YahyaExpenseCategory[] = [
    {
      id: 'creators',
      label: 'Creators (monthly)',
      totalUsd: sumPeople(creators),
      people: creators,
    },
    {
      id: 'reposters',
      label: 'Reposters (monthly)',
      totalUsd: sumPeople(reposters),
      people: reposters,
    },
    {
      id: 'leaders',
      label: 'Leaders / management (monthly)',
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

  const grandTotalUsd = round2(categories.reduce((s, c) => s + c.totalUsd, 0))

  const nearbyMonths = [-2, -1, 0, 1, 2].map((delta) => {
    const key = shiftYearMonth(yearMonth, delta)
    return { key, label: formatYearMonth(key) }
  })

  return {
    yearMonth,
    label: formatYearMonth(yearMonth),
    from,
    to,
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

export async function setYahyaPlacement(input: {
  personKey: string
  placement: YahyaPlacement
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  if (!/^leader-\d+$/.test(input.personKey)) {
    return { ok: false, error: 'Only dual-role people can change placement.' }
  }
  if (
    input.placement !== 'leaders' &&
    input.placement !== 'reposters' &&
    input.placement !== 'both'
  ) {
    return { ok: false, error: 'Bad placement' }
  }
  await sql`
    INSERT INTO yahya_expense_placements (person_key, placement, updated_at)
    VALUES (${input.personKey}, ${input.placement}, NOW())
    ON CONFLICT (person_key) DO UPDATE
      SET placement = EXCLUDED.placement, updated_at = NOW()
  `
  return { ok: true }
}

/**
 * Save a monthly amount.
 * - scope `site`: updates real pay everywhere (creators biweekly = monthly/2, leaders monthly).
 * - scope `page`: override for this month on Yahya's expenses only.
 */
export async function setYahyaPersonMonthly(input: {
  yearMonth: string
  personKey: string
  amount: number
  currency: 'USD' | 'SAR'
  scope: 'site' | 'page'
  creatorId?: number | null
  leaderId?: number | null
  otherId?: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) return { ok: false, error: 'Bad month' }
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Bad amount' }
  const currency = input.currency === 'USD' ? 'USD' : 'SAR'
  const rounded = round2(amount)

  if (input.scope === 'page') {
    if (input.otherId != null) {
      await sql`
        UPDATE yahya_other_expenses
        SET amount = ${rounded}, currency = ${currency}
        WHERE id = ${input.otherId}
      `
      return { ok: true }
    }
    await sql`
      INSERT INTO yahya_expense_overrides (year_month, person_key, amount, currency, updated_at)
      VALUES (${input.yearMonth}, ${input.personKey}, ${rounded}, ${currency}, NOW())
      ON CONFLICT (year_month, person_key) DO UPDATE
        SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, updated_at = NOW()
    `
    return { ok: true }
  }

  // site-wide
  if (input.leaderId != null && input.personKey.startsWith('leader-')) {
    await sql`
      UPDATE leaders
      SET monthly_pay = ${rounded}, pay_currency = ${currency}
      WHERE id = ${input.leaderId}
    `
    await sql`
      DELETE FROM yahya_expense_overrides
      WHERE year_month = ${input.yearMonth} AND person_key = ${input.personKey}
    `
    return { ok: true }
  }

  if (input.creatorId != null) {
    // Site pay for creators/reposters is stored as biweekly.
    const biweekly = round2(rounded / 2)
    await sql`
      UPDATE creators
      SET pay_currency = ${currency}, biweekly_amount = ${biweekly}
      WHERE id = ${input.creatorId}
    `
    await sql`
      DELETE FROM yahya_expense_overrides
      WHERE year_month = ${input.yearMonth} AND person_key = ${input.personKey}
    `
    return { ok: true }
  }

  if (input.otherId != null) {
    await sql`
      UPDATE yahya_other_expenses
      SET amount = ${rounded}, currency = ${currency}
      WHERE id = ${input.otherId}
    `
    return { ok: true }
  }

  return { ok: false, error: 'Unknown person' }
}

export async function clearYahyaPersonOverride(input: {
  yearMonth: string
  personKey: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  await sql`
    DELETE FROM yahya_expense_overrides
    WHERE year_month = ${input.yearMonth} AND person_key = ${input.personKey}
  `
  return { ok: true }
}
