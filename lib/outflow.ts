import 'server-only'
import { sql } from '@/lib/db'
import type { ParticipantRole } from '@/lib/participant-role'
import {
  buildBiweeklySchedule,
  inferBiweeklyInstallments,
  monthlyFromBiweekly,
  typicalBiweeklyAmount,
  yearMonthsInRange,
  type ContractPeriod,
} from '@/lib/biweekly'

export type OutflowView = 'creators' | 'reposters' | 'total'

/** How contract spend is counted in the contracts section. */
export type OutflowCountMode = 'base' | 'all'

export type OutflowContractRow = {
  creator_id: number
  creator_name: string
  role: string
  contract_id: number
  contract_name: string
  start_date: string
  end_date: string | null
  base_amount: number
  commission_amount: number | null
  pay_every_days: number
  upfront: number
  midterm: number
  full: number
  installment_source: 'payments' | 'split'
}

export type OutflowPaymentRow = {
  id: number
  paid_on: string
  amount: number
  note: string | null
  creator_id: number
  creator_name: string
  role: string
  contract_id: number | null
  contract_name: string | null
}

export type OutflowScheduleGroup = {
  paid_on: string
  term: string
  names: string[]
  count: number
  total: number
}

export type OutflowTimelineGroup = {
  paid_on: string
  scope: string
  recipients: { name: string; amount: number }[]
  total: number
}

export type OutflowMonthBucket = {
  key: string
  label: string
  creators: number
  reposters: number
  total: number
}

export type MarketingMonthPerson = {
  creator_id: number
  creator_name: string
  role: string
  planned: number
  paid: number
  installments: { dueOn: string; amount: number; label: string }[]
}

export type MarketingMonthBucket = {
  key: string
  label: string
  planned: number
  paid: number
  plannedCreators: number
  plannedReposters: number
  paidCreators: number
  paidReposters: number
  people: MarketingMonthPerson[]
}

export type OutflowPersonTotal = {
  creator_id: number
  creator_name: string
  role: string
  /** Planned month-to-month in range (base, no commission). */
  planned: number
  /** Recorded payments in range (may include commission if you paid it). */
  paid: number
  /** Contract base for overlapping contracts (no commission). */
  baseContract: number
  /** One biweekly wave for this person (avg of the two halves). */
  biweekly: number
  /** Always 2× biweekly. */
  monthly: number
}

export type OutflowSnapshot = {
  from: string
  to: string
  view: OutflowView
  countMode: OutflowCountMode
  creatorsTotal: number
  repostersTotal: number
  grandTotal: number
  contractsSpendTotal: number
  /** Typical one biweekly wave (avg of the two halves per contract). */
  plannedBiweekly: number
  /** Two biweekly waves — monthly pay is always double the biweekly amount. */
  plannedMonthly: number
  /** All planned dues in the selected range (month-to-month). */
  plannedTotal: number
  plannedCreators: number
  plannedReposters: number
  contracts: OutflowContractRow[]
  schedule: OutflowScheduleGroup[]
  timeline: OutflowTimelineGroup[]
  months: OutflowMonthBucket[]
  marketingMonths: MarketingMonthBucket[]
  peopleTotals: OutflowPersonTotal[]
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function termFromNote(note: string | null, role: string): string {
  const n = (note ?? '').toLowerCase()
  if (n.includes('upfront') || n.includes('1st') || n.includes('first'))
    return '1st half payment'
  if (n.includes('mid') || n.includes('2nd') || n.includes('second') || n.includes('day 15'))
    return '2nd half payment'
  if (n.includes('completion') || n.includes('balance') || n.includes('end'))
    return 'Completion balance'
  return role === 'reposter' ? 'Repost payment' : 'Contract payment'
}

function scopeFromNote(note: string | null): string {
  const n = (note ?? '').toLowerCase()
  if (n.includes('upfront') || n.includes('1st') || n.includes('first')) return '1st half'
  if (n.includes('mid') || n.includes('2nd') || n.includes('second') || n.includes('day 15'))
    return '2nd half'
  if (n.includes('completion') || n.includes('balance')) return 'Completion balance'
  return 'Payment'
}

export async function getOutflowSnapshot(opts: {
  from: string
  to: string
  view?: OutflowView
  countMode?: OutflowCountMode
  /** Header project filter — scopes people to that project. */
  projectId?: number | null
  /** Miyqat: include every creator in the people set. */
  includeAllCreators?: boolean
  /** Always include every reposter under a project filter. */
  includeAllReposters?: boolean
  /** Marketing-by-month panel: only reposter pay (ignore creators). */
  repostersOnly?: boolean
}): Promise<OutflowSnapshot> {
  const from = opts.from
  const to = opts.to
  const view: OutflowView = opts.repostersOnly
    ? 'reposters'
    : (opts.view ?? 'total')
  const countMode: OutflowCountMode = opts.countMode === 'all' ? 'all' : 'base'
  const roleFilter: ParticipantRole | null =
    view === 'creators' ? 'creator' : view === 'reposters' ? 'reposter' : null
  const projectId = opts.projectId ?? null
  const includeAllCreators = opts.includeAllCreators ?? false
  const includeAllReposters = opts.includeAllReposters ?? projectId != null

  const payments = (await sql`
    SELECT p.id, p.paid_on::text AS paid_on, p.amount::float AS amount, p.note,
           c.id AS creator_id, c.name AS creator_name, c.role,
           p.contract_id,
           ct.name AS contract_name
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    LEFT JOIN contracts ct ON ct.id = p.contract_id
    WHERE p.paid_on >= ${from}::date
      AND p.paid_on <= ${to}::date
      AND (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
      AND (
        ${projectId}::int IS NULL
        OR (c.role = 'reposter' AND ${includeAllReposters}::boolean)
        OR (c.role <> 'reposter' AND ${includeAllCreators}::boolean)
        OR c.project_id = ${projectId}
        OR (c.role <> 'reposter' AND c.project_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM submissions sx
          WHERE sx.creator_id = c.id AND sx.project_id = ${projectId}
        )
      )
    ORDER BY p.paid_on ASC, c.name ASC, p.id ASC
  `) as OutflowPaymentRow[]

  const peopleRows = (await sql`
    SELECT c.id AS creator_id, c.name AS creator_name, c.role
    FROM creators c
    WHERE (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
      AND (
        ${projectId}::int IS NULL
        OR (c.role = 'reposter' AND ${includeAllReposters}::boolean)
        OR (c.role <> 'reposter' AND ${includeAllCreators}::boolean)
        OR c.project_id = ${projectId}
        OR (c.role <> 'reposter' AND c.project_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM submissions sx
          WHERE sx.creator_id = c.id AND sx.project_id = ${projectId}
        )
      )
    ORDER BY c.name ASC
  `) as { creator_id: number; creator_name: string; role: string }[]

  type ContractQueryRow = Omit<
    OutflowContractRow,
    'upfront' | 'midterm' | 'full' | 'installment_source'
  > & { pay_every_days: number }

  const allContracts = (await sql`
    SELECT c.id AS creator_id, c.name AS creator_name, c.role,
           COALESCE(c.pay_every_days, 14)::int AS pay_every_days,
           ct.id AS contract_id, ct.name AS contract_name,
           ct.start_date::text AS start_date,
           ct.end_date::text AS end_date,
           ct.base_amount::float AS base_amount,
           ct.commission_amount::float AS commission_amount
    FROM contracts ct
    JOIN creators c ON c.id = ct.creator_id
    WHERE (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
      AND (
        ${projectId}::int IS NULL
        OR (c.role = 'reposter' AND ${includeAllReposters}::boolean)
        OR (c.role <> 'reposter' AND ${includeAllCreators}::boolean)
        OR c.project_id = ${projectId}
        OR (c.role <> 'reposter' AND c.project_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM submissions sx
          WHERE sx.creator_id = c.id AND sx.project_id = ${projectId}
        )
      )
    ORDER BY c.id ASC, ct.start_date DESC, ct.id DESC
  `) as ContractQueryRow[]

  const contracts = allContracts.filter(
    (row) => row.start_date <= to && (row.end_date == null || row.end_date >= from),
  )

  const historyRows = (await sql`
    SELECT p.contract_id, p.paid_on::text AS paid_on, p.amount::float AS amount
    FROM payments p
    JOIN contracts ct ON ct.id = p.contract_id
    JOIN creators c ON c.id = ct.creator_id
    WHERE ct.start_date <= ${to}::date
      AND (ct.end_date IS NULL OR ct.end_date >= ${from}::date)
      AND (${roleFilter}::text IS NULL OR c.role = ${roleFilter})
      AND (
        ${projectId}::int IS NULL
        OR (c.role = 'reposter' AND ${includeAllReposters}::boolean)
        OR (c.role <> 'reposter' AND ${includeAllCreators}::boolean)
        OR c.project_id = ${projectId}
        OR (c.role <> 'reposter' AND c.project_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM submissions sx
          WHERE sx.creator_id = c.id AND sx.project_id = ${projectId}
        )
      )
    ORDER BY p.paid_on ASC, p.id ASC
  `) as { contract_id: number; paid_on: string; amount: number }[]

  const historyByContract = new Map<number, number[]>()
  for (const row of historyRows) {
    if (row.contract_id == null) continue
    const list = historyByContract.get(row.contract_id) ?? []
    list.push(Number(row.amount) || 0)
    historyByContract.set(row.contract_id, list)
  }

  type PersonRate = {
    creator_id: number
    creator_name: string
    role: string
    baseContract: number
    biweekly: number
    monthly: number
  }
  const rateByCreator = new Map<number, PersonRate>()
  const contractsByCreator = new Map<number, ContractQueryRow[]>()
  for (const row of allContracts) {
    const list = contractsByCreator.get(row.creator_id) ?? []
    list.push(row)
    contractsByCreator.set(row.creator_id, list)
  }
  for (const rows of contractsByCreator.values()) {
    const source = rows[0]
    if (!source) continue
    const prior: ContractPeriod[] = rows
      .filter((r) => r.contract_id !== source.contract_id)
      .map((r) => ({
        startDate: r.start_date,
        endDate: r.end_date,
        baseAmount: Number(r.base_amount) || 0,
      }))
    const biweekly = typicalBiweeklyAmount({
      baseAmount: Number(source.base_amount) || 0,
      startDate: source.start_date,
      endDate: source.end_date,
      payEveryDays: source.pay_every_days,
      prior,
    })
    rateByCreator.set(source.creator_id, {
      creator_id: source.creator_id,
      creator_name: source.creator_name,
      role: source.role,
      baseContract: Number(source.base_amount) || 0,
      biweekly,
      monthly: monthlyFromBiweekly(biweekly),
    })
  }

  const contractRows: OutflowContractRow[] = contracts.map((row) => {
    const base = Number(row.base_amount) || 0
    const commission = Number(row.commission_amount) || 0
    const full = countMode === 'all' ? base + commission : base
    const typical = rateByCreator.get(row.creator_id)?.biweekly
    const inferred = inferBiweeklyInstallments(full, historyByContract.get(row.contract_id) ?? [])
    const wave = typical != null && typical > 0 ? typical : (inferred.first + inferred.second) / 2
    return {
      ...row,
      base_amount: base,
      commission_amount: row.commission_amount == null ? null : commission,
      pay_every_days: row.pay_every_days > 0 ? row.pay_every_days : 14,
      upfront: wave,
      midterm: wave,
      full,
      installment_source: inferred.source,
    }
  })
  const contractsSpendTotal = contractRows.reduce((sum, row) => sum + row.full, 0)

  // Planned month-to-month dues falling in the selected range, bucketed by calendar month.
  type PlannedHit = {
    creator_id: number
    creator_name: string
    role: string
    dueOn: string
    amount: number
    label: string
  }
  const plannedHits: PlannedHit[] = []
  for (const row of contractRows) {
    const schedule = buildBiweeklySchedule({
      startDate: row.start_date,
      endDate: row.end_date,
      through: to,
      first: row.upfront,
      second: row.midterm,
      everyDays: row.pay_every_days,
    })
    for (const inst of schedule) {
      if (inst.dueOn < from || inst.dueOn > to) continue
      plannedHits.push({
        creator_id: row.creator_id,
        creator_name: row.creator_name,
        role: row.role,
        dueOn: inst.dueOn,
        amount: inst.amount,
        label: inst.label,
      })
    }
  }
  const plannedTotal = plannedHits.reduce((s, h) => s + h.amount, 0)
  const plannedCreators = plannedHits
    .filter((h) => h.role !== 'reposter')
    .reduce((s, h) => s + h.amount, 0)
  const plannedReposters = plannedHits
    .filter((h) => h.role === 'reposter')
    .reduce((s, h) => s + h.amount, 0)
  const peopleMap = new Map<number, OutflowPersonTotal>()

  function emptyPerson(input: {
    creator_id: number
    creator_name: string
    role: string
  }): OutflowPersonTotal {
    return {
      creator_id: input.creator_id,
      creator_name: input.creator_name,
      role: input.role,
      planned: 0,
      paid: 0,
      baseContract: 0,
      biweekly: 0,
      monthly: 0,
    }
  }

  function touchPerson(input: {
    creator_id: number
    creator_name: string
    role: string
  }): OutflowPersonTotal {
    const existing = peopleMap.get(input.creator_id) ?? emptyPerson(input)
    peopleMap.set(input.creator_id, existing)
    return existing
  }

  for (const person of peopleRows) {
    touchPerson(person)
  }
  for (const rate of rateByCreator.values()) {
    const existing = touchPerson(rate)
    existing.baseContract = rate.baseContract
    existing.biweekly = rate.biweekly
    existing.monthly = rate.monthly
  }
  for (const hit of plannedHits) {
    touchPerson(hit).planned += hit.amount
  }
  for (const p of payments) {
    touchPerson(p).paid += Number(p.amount) || 0
  }
  const peopleTotals = [...peopleMap.values()].sort((a, b) =>
    a.creator_name.localeCompare(b.creator_name),
  )
  const plannedBiweekly =
    Math.round(peopleTotals.reduce((s, p) => s + p.biweekly, 0) * 100) / 100
  const plannedMonthly =
    Math.round(peopleTotals.reduce((s, p) => s + p.monthly, 0) * 100) / 100

  const marketingMap = new Map<string, MarketingMonthBucket>()

  function ensureMonth(key: string): MarketingMonthBucket {
    let bucket = marketingMap.get(key)
    if (!bucket) {
      bucket = {
        key,
        label: monthLabel(key),
        planned: 0,
        paid: 0,
        plannedCreators: 0,
        plannedReposters: 0,
        paidCreators: 0,
        paidReposters: 0,
        people: [],
      }
      marketingMap.set(key, bucket)
    }
    return bucket
  }

  const peopleByMonth = new Map<string, Map<number, MarketingMonthPerson>>()

  function ensurePerson(
    monthKey: string,
    hit: { creator_id: number; creator_name: string; role: string },
  ): MarketingMonthPerson {
    let byId = peopleByMonth.get(monthKey)
    if (!byId) {
      byId = new Map()
      peopleByMonth.set(monthKey, byId)
    }
    let person = byId.get(hit.creator_id)
    if (!person) {
      person = {
        creator_id: hit.creator_id,
        creator_name: hit.creator_name,
        role: hit.role,
        planned: 0,
        paid: 0,
        installments: [],
      }
      byId.set(hit.creator_id, person)
    }
    return person
  }

  for (const key of yearMonthsInRange(from, to)) {
    ensureMonth(key)
    for (const person of peopleRows) {
      ensurePerson(key, person)
    }
  }

  for (const hit of plannedHits) {
    const key = hit.dueOn.slice(0, 7)
    const bucket = ensureMonth(key)
    bucket.planned += hit.amount
    if (hit.role === 'reposter') bucket.plannedReposters += hit.amount
    else bucket.plannedCreators += hit.amount
    const person = ensurePerson(key, hit)
    person.planned += hit.amount
    person.installments.push({ dueOn: hit.dueOn, amount: hit.amount, label: hit.label })
  }

  for (const p of payments) {
    const key = p.paid_on.slice(0, 7)
    const bucket = ensureMonth(key)
    const amount = Number(p.amount) || 0
    bucket.paid += amount
    if (p.role === 'reposter') bucket.paidReposters += amount
    else bucket.paidCreators += amount
    const person = ensurePerson(key, p)
    person.paid += amount
  }

  const marketingMonths = [...marketingMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket) => {
      const people = [...(peopleByMonth.get(bucket.key)?.values() ?? [])].sort((a, b) =>
        a.creator_name.localeCompare(b.creator_name),
      )
      return { ...bucket, people }
    })

  // Schedule: group same-day + same-term payments (compact roster style).
  const scheduleMap = new Map<string, OutflowScheduleGroup>()
  for (const p of payments) {
    const term = termFromNote(p.note, p.role)
    const key = `${p.paid_on}|${term}`
    const existing = scheduleMap.get(key)
    if (existing) {
      if (!existing.names.includes(p.creator_name)) existing.names.push(p.creator_name)
      existing.count = existing.names.length
      existing.total += Number(p.amount) || 0
    } else {
      scheduleMap.set(key, {
        paid_on: p.paid_on,
        term,
        names: [p.creator_name],
        count: 1,
        total: Number(p.amount) || 0,
      })
    }
  }
  const schedule = [...scheduleMap.values()].sort((a, b) =>
    a.paid_on === b.paid_on ? a.term.localeCompare(b.term) : a.paid_on.localeCompare(b.paid_on),
  )

  const timelineMap = new Map<string, OutflowTimelineGroup>()
  for (const p of payments) {
    const scope = scopeFromNote(p.note)
    const key = `${p.paid_on}|${scope}`
    const existing = timelineMap.get(key)
    const amount = Number(p.amount) || 0
    if (existing) {
      existing.recipients.push({ name: p.creator_name, amount })
      existing.total += amount
    } else {
      timelineMap.set(key, {
        paid_on: p.paid_on,
        scope,
        recipients: [{ name: p.creator_name, amount }],
        total: amount,
      })
    }
  }
  const timeline = [...timelineMap.values()].sort((a, b) =>
    a.paid_on === b.paid_on ? a.scope.localeCompare(b.scope) : a.paid_on.localeCompare(b.paid_on),
  )

  const roleTotals = (await sql`
    SELECT c.role, COALESCE(SUM(p.amount), 0)::float AS total
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    WHERE p.paid_on >= ${from}::date AND p.paid_on <= ${to}::date
    GROUP BY c.role
  `) as { role: string; total: number }[]

  let creatorsTotal = 0
  let repostersTotal = 0
  for (const row of roleTotals) {
    if (row.role === 'reposter') repostersTotal = Number(row.total) || 0
    else creatorsTotal = Number(row.total) || 0
  }

  const monthRows = (await sql`
    SELECT to_char(p.paid_on, 'YYYY-MM') AS key,
           c.role,
           COALESCE(SUM(p.amount), 0)::float AS total
    FROM payments p
    JOIN creators c ON c.id = p.creator_id
    WHERE p.paid_on >= ${from}::date AND p.paid_on <= ${to}::date
    GROUP BY 1, c.role
    ORDER BY 1 ASC
  `) as { key: string; role: string; total: number }[]

  const monthsMap = new Map<string, OutflowMonthBucket>()
  for (const row of monthRows) {
    const bucket =
      monthsMap.get(row.key) ??
      ({
        key: row.key,
        label: monthLabel(row.key),
        creators: 0,
        reposters: 0,
        total: 0,
      } satisfies OutflowMonthBucket)
    const amount = Number(row.total) || 0
    if (row.role === 'reposter') bucket.reposters += amount
    else bucket.creators += amount
    bucket.total = bucket.creators + bucket.reposters
    monthsMap.set(row.key, bucket)
  }

  return {
    from,
    to,
    view,
    countMode,
    creatorsTotal,
    repostersTotal,
    grandTotal: creatorsTotal + repostersTotal,
    contractsSpendTotal,
    plannedBiweekly,
    plannedMonthly,
    plannedTotal,
    plannedCreators,
    plannedReposters,
    contracts: contractRows,
    schedule,
    timeline,
    months: [...monthsMap.values()],
    marketingMonths,
    peopleTotals,
  }
}
