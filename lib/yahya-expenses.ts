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

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Where a person counts on Yahya’s expenses page. */
export type YahyaHome = 'creators' | 'reposters' | 'leaders' | 'both' | 'hidden'

/** @deprecated use YahyaHome — kept for dual-role wording in the UI */
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
  /** Effective home on this page. */
  home: YahyaHome
  /** Canonical key used to save home (leader key for duals). */
  homeKey: string
  isDual: boolean
}

export type YahyaExpenseCategory = {
  id: YahyaCategoryId
  label: string
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

export type YahyaAddCandidate = {
  key: string
  name: string
  kind: 'creator' | 'reposter' | 'leader'
  creatorId: number | null
  leaderId: number | null
  currency: 'USD' | 'SAR'
  /** Suggested monthly amount already on file (may be 0). */
  suggestedMonthly: number
}

export type YahyaExpensesSnapshot = {
  yearMonth: string
  label: string
  from: string
  to: string
  grandTotalUsd: number
  categories: YahyaExpenseCategory[]
  other: YahyaOtherExpense[]
  nearbyMonths: { key: string; label: string }[]
  /** People Yahya/Ahmed can add into a list (not already showing, or $0). */
  addCandidates: YahyaAddCandidate[]
}

const HOMES = new Set<YahyaHome>(['creators', 'reposters', 'leaders', 'both', 'hidden'])

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

async function listHomes() {
  await ensureYahyaExpenseTables()
  const rows = (await sql`
    SELECT person_key, placement FROM yahya_expense_placements
  `) as { person_key: string; placement: string }[]
  const map = new Map<string, YahyaHome>()
  for (const r of rows) {
    if (HOMES.has(r.placement as YahyaHome)) map.set(r.person_key, r.placement as YahyaHome)
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

type RawPerson = {
  key: string
  name: string
  role: string
  natural: 'creators' | 'reposters' | 'leaders'
  monthlyUsd: number
  currency: 'USD' | 'SAR'
  nativeMonthly: number
  pageOverride: boolean
  creatorId: number | null
  leaderId: number | null
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

  const [outflow, leadersDir, other, overrides, homes] = await Promise.all([
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
    listHomes(),
  ])

  const creatorRaws: RawPerson[] = []
  const reposterRaws: RawPerson[] = []
  for (const p of outflow.peopleTotals) {
    if (p.monthly <= 0) continue
    const isReposter = p.role === 'reposter'
    const key = isReposter ? `reposter-${p.creator_id}` : `creator-${p.creator_id}`
    const currency = p.currency
    const nativeMonthly =
      currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD)
    const paid = applyOverride(
      key,
      { monthlyUsd: round2(p.monthly), currency, nativeMonthly },
      overrides,
    )
    const raw: RawPerson = {
      key,
      name: p.creator_name,
      role: isReposter ? 'reposter' : 'creator',
      natural: isReposter ? 'reposters' : 'creators',
      creatorId: p.creator_id,
      leaderId: null,
      ...paid,
    }
    if (isReposter) reposterRaws.push(raw)
    else creatorRaws.push(raw)
  }

  const leaderRaws: RawPerson[] = []
  for (const l of leadersDir.leaders) {
    const currency = l.payCurrency
    const native = Number(l.monthlyPay) || 0
    // Keep unpaid leaders if they are linked to a reposter (dual) — amount may be 0.
    if (native <= 0 && l.reposterId == null) continue
    const key = `leader-${l.id}`
    const paid = applyOverride(
      key,
      {
        monthlyUsd: round2(toUsd(native, currency)),
        currency,
        nativeMonthly: round2(native),
      },
      overrides,
    )
    // Skip leaders with no pay and no override unless dual-linked below.
    if (paid.monthlyUsd <= 0 && l.reposterId == null && !paid.pageOverride) continue
    leaderRaws.push({
      key,
      name: l.name,
      role: l.level || 'leader',
      natural: 'leaders',
      creatorId: l.reposterId,
      leaderId: l.id,
      ...paid,
    })
  }

  // Dual links: explicit reposter_id, else same normalized name.
  type DualLink = {
    homeKey: string
    leader: RawPerson
    reposter: RawPerson
    leaderName: string
    reposterName: string
  }
  const duals: DualLink[] = []
  const usedReposterKeys = new Set<string>()
  const usedLeaderKeys = new Set<string>()

  const reposterById = new Map(reposterRaws.map((r) => [r.creatorId, r]))
  const reposterByName = new Map(reposterRaws.map((r) => [normName(r.name), r]))

  for (const leader of leadersDir.leaders) {
    const leaderRaw = leaderRaws.find((r) => r.leaderId === leader.id)
    if (!leaderRaw) {
      // Leader with no pay yet — still dual if linked to a paid reposter.
      if (leader.reposterId == null && !reposterByName.has(normName(leader.name))) continue
    }

    let reposter =
      leader.reposterId != null ? (reposterById.get(leader.reposterId) ?? null) : null
    if (!reposter) {
      const byName = reposterByName.get(normName(leader.name))
      if (byName) reposter = byName
      else if (leader.reposterName) {
        reposter = reposterByName.get(normName(leader.reposterName)) ?? null
      }
    }
    if (!reposter) continue

    const lr =
      leaderRaw ??
      ({
        key: `leader-${leader.id}`,
        name: leader.name,
        role: leader.level || 'leader',
        natural: 'leaders' as const,
        monthlyUsd: 0,
        currency: leader.payCurrency,
        nativeMonthly: 0,
        pageOverride: false,
        creatorId: leader.reposterId,
        leaderId: leader.id,
      } satisfies RawPerson)

    if (usedReposterKeys.has(reposter.key) || usedLeaderKeys.has(lr.key)) continue
    usedReposterKeys.add(reposter.key)
    usedLeaderKeys.add(lr.key)
    duals.push({
      homeKey: lr.key,
      leader: lr,
      reposter,
      leaderName: lr.name,
      reposterName: reposter.name,
    })
  }

  const dualReposterKeys = new Set(duals.map((d) => d.reposter.key))
  const dualLeaderKeys = new Set(duals.map((d) => d.leader.key))

  function homeFor(key: string, natural: YahyaHome): YahyaHome {
    return homes.get(key) ?? natural
  }

  const creators: YahyaExpensePerson[] = []
  const reposters: YahyaExpensePerson[] = []
  const leaders: YahyaExpensePerson[] = []

  function pushPerson(
    bucket: 'creators' | 'reposters' | 'leaders',
    raw: RawPerson,
    opts: {
      home: YahyaHome
      homeKey: string
      isDual: boolean
      also: YahyaExpensePerson['also']
    },
  ) {
    // Keep dual management rows even at 0 so Yahya can place them; skip other empty rows.
    if (raw.monthlyUsd <= 0 && !raw.pageOverride) {
      if (!(opts.isDual && bucket === 'leaders')) return
    }
    const row: YahyaExpensePerson = {
      key: raw.key,
      name: raw.name,
      role: raw.role,
      categoryId: bucket,
      monthlyUsd: raw.monthlyUsd,
      currency: raw.currency,
      nativeMonthly: raw.nativeMonthly,
      creatorId: raw.creatorId,
      leaderId: raw.leaderId,
      otherId: null,
      pageOverride: raw.pageOverride,
      also: opts.also,
      home: opts.home,
      homeKey: opts.homeKey,
      isDual: opts.isDual,
    }
    if (bucket === 'creators') creators.push(row)
    else if (bucket === 'reposters') reposters.push(row)
    else leaders.push(row)
  }

  // Dual people first.
  for (const dual of duals) {
    const home = homeFor(dual.homeKey, 'leaders')
    const alsoOnLeader: YahyaExpensePerson['also'] = {
      kind: 'reposter',
      label: dual.reposterName,
      creatorId: dual.reposter.creatorId,
      leaderId: dual.leader.leaderId,
    }
    const alsoOnReposter: YahyaExpensePerson['also'] = {
      kind: 'leader',
      label: dual.leaderName,
      creatorId: dual.reposter.creatorId,
      leaderId: dual.leader.leaderId,
    }
    if (home === 'hidden') continue
    if (home === 'leaders' || home === 'both' || home === 'creators') {
      // creators home for a dual still shows under management (they are a leader).
      pushPerson(home === 'creators' ? 'creators' : 'leaders', dual.leader, {
        home,
        homeKey: dual.homeKey,
        isDual: true,
        also: alsoOnLeader,
      })
    }
    if (home === 'reposters' || home === 'both') {
      pushPerson('reposters', dual.reposter, {
        home,
        homeKey: dual.homeKey,
        isDual: true,
        also: alsoOnReposter,
      })
    }
    // If home is creators only, also keep them out of reposters (already).
  }

  // Solo creators / reposters / leaders.
  for (const raw of creatorRaws) {
    if (dualReposterKeys.has(raw.key) || dualLeaderKeys.has(raw.key)) continue
    const home = homeFor(raw.key, 'creators')
    if (home === 'hidden') continue
    if (home === 'both') {
      pushPerson('creators', raw, { home, homeKey: raw.key, isDual: false, also: null })
      pushPerson('reposters', raw, { home, homeKey: raw.key, isDual: false, also: null })
      continue
    }
    const bucket = home === 'leaders' || home === 'reposters' || home === 'creators' ? home : 'creators'
    pushPerson(bucket, raw, { home, homeKey: raw.key, isDual: false, also: null })
  }

  for (const raw of reposterRaws) {
    if (dualReposterKeys.has(raw.key)) continue
    const home = homeFor(raw.key, 'reposters')
    if (home === 'hidden') continue
    if (home === 'both') {
      pushPerson('reposters', raw, { home, homeKey: raw.key, isDual: false, also: null })
      pushPerson('leaders', raw, { home, homeKey: raw.key, isDual: false, also: null })
      continue
    }
    const bucket = home === 'creators' || home === 'leaders' || home === 'reposters' ? home : 'reposters'
    pushPerson(bucket, raw, { home, homeKey: raw.key, isDual: false, also: null })
  }

  for (const raw of leaderRaws) {
    if (dualLeaderKeys.has(raw.key)) continue
    if (raw.monthlyUsd <= 0 && !raw.pageOverride) continue
    const home = homeFor(raw.key, 'leaders')
    if (home === 'hidden') continue
    if (home === 'both') {
      pushPerson('leaders', raw, { home, homeKey: raw.key, isDual: false, also: null })
      pushPerson('reposters', raw, { home, homeKey: raw.key, isDual: false, also: null })
      continue
    }
    const bucket = home === 'creators' || home === 'reposters' || home === 'leaders' ? home : 'leaders'
    pushPerson(bucket, raw, { home, homeKey: raw.key, isDual: false, also: null })
  }

  creators.sort((a, b) => a.name.localeCompare(b.name))
  reposters.sort((a, b) => a.name.localeCompare(b.name))
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
    home: 'creators',
    homeKey: `other-${o.id}`,
    isDual: false,
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

  const presentKeys = new Set(
    categories.flatMap((c) => c.people.filter((p) => p.monthlyUsd > 0).map((p) => p.key)),
  )
  const presentCreatorIds = new Set(
    categories.flatMap((c) =>
      c.people.filter((p) => p.monthlyUsd > 0 && p.creatorId != null).map((p) => p.creatorId!),
    ),
  )
  const presentLeaderIds = new Set(
    categories.flatMap((c) =>
      c.people.filter((p) => p.monthlyUsd > 0 && p.leaderId != null).map((p) => p.leaderId!),
    ),
  )

  const addCandidates: YahyaAddCandidate[] = []
  for (const p of outflow.peopleTotals) {
    const isReposter = p.role === 'reposter'
    const key = isReposter ? `reposter-${p.creator_id}` : `creator-${p.creator_id}`
    if (presentKeys.has(key) || presentCreatorIds.has(p.creator_id)) continue
    const currency = p.currency
    const suggested =
      currency === 'USD' ? round2(p.monthly) : round2(p.monthly * SAR_PER_USD)
    addCandidates.push({
      key,
      name: p.creator_name,
      kind: isReposter ? 'reposter' : 'creator',
      creatorId: p.creator_id,
      leaderId: null,
      currency,
      suggestedMonthly: suggested,
    })
  }
  // Creators/reposters with no contract pay yet still show up as addable.
  const paidCreatorIds = new Set(outflow.peopleTotals.map((p) => p.creator_id))
  const zeroPayPeople = (await sql`
    SELECT id, name, role, pay_currency, biweekly_amount::float AS biweekly_amount
    FROM creators
    WHERE paused_at IS NULL
      AND role IN ('creator', 'reposter')
    ORDER BY name ASC
  `) as {
    id: number
    name: string
    role: string
    pay_currency: string | null
    biweekly_amount: number | null
  }[]
  for (const row of zeroPayPeople) {
    if (paidCreatorIds.has(row.id) || presentCreatorIds.has(row.id)) continue
    const isReposter = row.role === 'reposter'
    const key = isReposter ? `reposter-${row.id}` : `creator-${row.id}`
    if (presentKeys.has(key)) continue
    const currency: 'USD' | 'SAR' =
      row.pay_currency === 'USD' || row.pay_currency === 'SAR'
        ? row.pay_currency
        : isReposter
          ? 'USD'
          : 'SAR'
    const biweekly = Number(row.biweekly_amount) || 0
    const monthly = round2(biweekly * 2)
    addCandidates.push({
      key,
      name: row.name,
      kind: isReposter ? 'reposter' : 'creator',
      creatorId: row.id,
      leaderId: null,
      currency,
      suggestedMonthly: monthly,
    })
  }
  for (const l of leadersDir.leaders) {
    if (presentLeaderIds.has(l.id) || presentKeys.has(`leader-${l.id}`)) continue
    const currency = l.payCurrency
    const native = Number(l.monthlyPay) || 0
    addCandidates.push({
      key: `leader-${l.id}`,
      name: l.name,
      kind: 'leader',
      creatorId: l.reposterId,
      leaderId: l.id,
      currency,
      suggestedMonthly: round2(native),
    })
  }
  addCandidates.sort((a, b) => a.name.localeCompare(b.name))

  return {
    yearMonth,
    label: formatYearMonth(yearMonth),
    from,
    to,
    grandTotalUsd,
    categories,
    other,
    nearbyMonths,
    addCandidates,
  }
}

/** Put an existing person onto a Yahya expense list with a monthly amount. */
export async function addYahyaPersonToList(input: {
  yearMonth: string
  personKey: string
  home: 'creators' | 'reposters' | 'leaders'
  amount: number
  currency: 'USD' | 'SAR'
  scope: 'site' | 'page'
  creatorId?: number | null
  leaderId?: number | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const homeRes = await setYahyaHome({ personKey: input.personKey, home: input.home })
  if (!homeRes.ok) return homeRes
  return setYahyaPersonMonthly({
    yearMonth: input.yearMonth,
    personKey: input.personKey,
    amount: input.amount,
    currency: input.currency,
    scope: input.scope,
    creatorId: input.creatorId,
    leaderId: input.leaderId,
  })
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

/** Move someone between expense lists (or dual placement). */
export async function setYahyaHome(input: {
  personKey: string
  home: YahyaHome
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureYahyaExpenseTables()
  if (!input.personKey.trim()) return { ok: false, error: 'Missing person' }
  if (!HOMES.has(input.home)) return { ok: false, error: 'Bad destination' }
  await sql`
    INSERT INTO yahya_expense_placements (person_key, placement, updated_at)
    VALUES (${input.personKey}, ${input.home}, NOW())
    ON CONFLICT (person_key) DO UPDATE
      SET placement = EXCLUDED.placement, updated_at = NOW()
  `
  return { ok: true }
}

/** @deprecated use setYahyaHome */
export async function setYahyaPlacement(input: {
  personKey: string
  placement: YahyaPlacement
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return setYahyaHome({ personKey: input.personKey, home: input.placement })
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
