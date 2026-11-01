import 'server-only'
import { sql } from '@/lib/db'
import { canSeeStructureTier, type StructureTier } from '@/lib/admin-access'
import { ensureCompanyRoleTable, getCompanyStructure } from '@/lib/company-structure'
import { ensureLeaderTables } from '@/lib/leaders'
import { ensureOutreachTables } from '@/lib/outreach'
import type { StructurePaySlot, StructurePayTiming } from '@/lib/company-roles'
import type { CalendarContractInput, CalendarPaymentInput } from '@/lib/payment-calendar'
import { contractWaveStatus } from '@/lib/contract-halves'
import { buildCreatorPaySchedule, normalizePayTiming, resolvePayTiming } from '@/lib/payment-calendar-math'

type PayRow = { amount: number; paid_on: string; note: string | null }

type StoredPay = {
  subject_key: string
  start_date: string
  end_date: string | null
  pay_timing: string | null
  base_amount: number
  pay_currency: string | null
  first_pay_amount: number | null
  second_pay_amount: number | null
  details_done: boolean
}

const EMPTY_WAVES = {
  detailsDone: false,
  hasTwoPays: false,
  firstDue: 0,
  firstPaid: 0,
  firstBalance: 0,
  firstSettled: true,
  firstDueOn: null as string | null,
  firstLabel: 'First payment',
  secondDue: 0,
  secondPaid: 0,
  secondBalance: 0,
  secondSettled: true,
  secondDueOn: null as string | null,
  secondLabel: 'Second payment',
  firstOverride: null as number | null,
  secondOverride: null as number | null,
}

export async function ensureStructurePayTable() {
  await ensureCompanyRoleTable()
  await sql`
    CREATE TABLE IF NOT EXISTS structure_contracts (
      subject_key TEXT PRIMARY KEY,
      start_date DATE NOT NULL,
      end_date DATE,
      pay_timing TEXT NOT NULL DEFAULT 'fifteen',
      base_amount numeric(12, 2) NOT NULL DEFAULT 0,
      pay_currency TEXT NOT NULL DEFAULT 'SAR',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE structure_contracts ADD COLUMN IF NOT EXISTS first_pay_amount numeric(12, 2)`
  await sql`ALTER TABLE structure_contracts ADD COLUMN IF NOT EXISTS second_pay_amount numeric(12, 2)`
  await sql`ALTER TABLE structure_contracts ADD COLUMN IF NOT EXISTS details_done boolean NOT NULL DEFAULT false`
  await sql`
    CREATE TABLE IF NOT EXISTS structure_payments (
      id SERIAL PRIMARY KEY,
      subject_key TEXT NOT NULL,
      paid_on DATE NOT NULL,
      amount numeric(12, 2) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

function wavesFor(opts: {
  start: string | null
  end: string | null
  amount: number
  timing: string | null
  payments: PayRow[]
  firstOverride: number | null
  secondOverride: number | null
  detailsDone: boolean
  today: string
}) {
  if (!opts.start || opts.amount <= 0.009) {
    return { ...EMPTY_WAVES, detailsDone: opts.detailsDone }
  }
  const timing = resolvePayTiming({
    stored: opts.timing,
    startDate: opts.start,
    endDate: opts.end,
    paidOn: opts.payments.map((p) => p.paid_on),
    notes: opts.payments.map((p) => p.note ?? ''),
  })
  const waves = contractWaveStatus({
    start: opts.start,
    end: opts.end,
    minDue: opts.amount,
    payments: opts.payments,
    timing,
    firstAmount: opts.firstOverride,
    secondAmount: opts.secondOverride,
  })
  const slices = buildCreatorPaySchedule({
    startDate: opts.start,
    endDate: opts.end,
    timing,
    through: opts.end ?? opts.today,
  })
  return {
    detailsDone: opts.detailsDone,
    hasTwoPays: waves.hasTwoHalves,
    firstDue: waves.firstDue,
    firstPaid: waves.firstPaid,
    firstBalance: waves.firstBalance,
    firstSettled: waves.firstSettled,
    firstDueOn: slices[0]?.dueOn ?? null,
    firstLabel: slices[0]?.label ?? 'First payment',
    secondDue: waves.secondDue,
    secondPaid: waves.secondPaid,
    secondBalance: waves.secondBalance,
    secondSettled: waves.secondSettled,
    secondDueOn: slices[1]?.dueOn ?? null,
    secondLabel: slices[1]?.label ?? 'Second payment',
    firstOverride: opts.firstOverride,
    secondOverride: opts.secondOverride,
  }
}

function timingOf(value: string | null | undefined): StructurePayTiming | null {
  return normalizePayTiming(value)
}

function currencyOf(value: string | null | undefined): 'SAR' | 'USD' {
  return value === 'USD' ? 'USD' : 'SAR'
}

/** Stable negative ids so structure pay never settles against a creator payment. */
export function structureCalendarIds(subjectKey: string): { creatorId: number; contractId: number } {
  if (subjectKey === 'executive:ceo') return { creatorId: -1, contractId: -1 }
  if (subjectKey === 'executive:coo') return { creatorId: -2, contractId: -2 }
  if (subjectKey === 'executive:deputy_coo') return { creatorId: -3, contractId: -3 }
  const leader = /^leader:(\d+)$/.exec(subjectKey)
  if (leader) {
    const id = -10_000 - Number(leader[1])
    return { creatorId: id, contractId: id }
  }
  const outreach = /^outreach:(\d+)$/.exec(subjectKey)
  if (outreach) {
    const id = -200_000 - Number(outreach[1])
    return { creatorId: id, contractId: id }
  }
  const id = -300_000
  return { creatorId: id, contractId: id }
}

export function tierFromSubjectKey(subjectKey: string): StructureTier | null {
  if (subjectKey === 'executive:ceo') return 'ceo'
  if (subjectKey === 'executive:coo') return 'coo'
  if (subjectKey === 'executive:deputy_coo') return 'deputy_coo'
  if (subjectKey.startsWith('leader:')) return 'leader'
  if (subjectKey.startsWith('outreach:')) return 'outreach'
  if (subjectKey.startsWith('reposter:')) return 'reposter'
  return null
}

async function storedPays(): Promise<Map<string, StoredPay>> {
  await ensureStructurePayTable()
  const rows = (await sql`
    SELECT subject_key, start_date::text AS start_date, end_date::text AS end_date,
           pay_timing, base_amount::float AS base_amount, pay_currency,
           first_pay_amount::float AS first_pay_amount,
           second_pay_amount::float AS second_pay_amount,
           details_done
    FROM structure_contracts
  `) as StoredPay[]
  return new Map(rows.map((row) => [row.subject_key, row]))
}

export async function loadStructurePaySlots(
  viewerId: string | null | undefined,
  today?: string,
): Promise<StructurePaySlot[]> {
  const day = today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10)
  await Promise.all([ensureLeaderTables(), ensureOutreachTables(), ensureStructurePayTable()])
  const [structure, pays, payRows, leaders, outreachRows, reposters] = await Promise.all([
    getCompanyStructure(),
    storedPays(),
    sql`
      SELECT subject_key, paid_on::text AS paid_on, amount::float AS amount, note
      FROM structure_payments
      ORDER BY paid_on ASC, id ASC
    ` as Promise<Array<PayRow & { subject_key: string }>>,
    sql`
      SELECT id, name, monthly_pay::float AS monthly_pay, pay_currency,
             level_since::text AS level_since
      FROM leaders
      ORDER BY name ASC
    ` as Promise<
      Array<{
        id: number
        name: string
        monthly_pay: number | null
        pay_currency: string | null
        level_since: string | null
      }>
    >,
    sql`
      SELECT id, name, creator_id, leader_id
      FROM outreach_members
      WHERE role = 'outreach'
      ORDER BY name ASC
    ` as Promise<Array<{ id: number; name: string; creator_id: number | null; leader_id: number | null }>>,
    sql`
      SELECT c.id, c.name, c.role, c.pay_currency,
             c.tiktok_username, c.instagram_username, c.login_platform,
             c.notek_tiktok_username, c.notek_instagram_username,
             c.miqat_tiktok_username, c.miqat_instagram_username,
             ct.id AS contract_id,
             ct.start_date::text AS start_date,
             ct.end_date::text AS end_date,
             ct.base_amount::float AS base_amount,
             ct.pay_timing,
             ct.first_pay_amount::float AS first_pay_amount,
             ct.second_pay_amount::float AS second_pay_amount,
             ct.details_done
      FROM creators c
      LEFT JOIN LATERAL (
        SELECT id, start_date, end_date, base_amount, pay_timing,
               first_pay_amount, second_pay_amount, details_done
        FROM contracts
        WHERE creator_id = c.id
        ORDER BY start_date DESC, id DESC
        LIMIT 1
      ) ct ON true
      WHERE c.role = 'reposter' AND c.paused_at IS NULL
      ORDER BY c.name ASC
    ` as Promise<
      Array<{
        id: number
        name: string
        role: string
        pay_currency: string | null
        tiktok_username: string | null
        instagram_username: string | null
        login_platform: string | null
        notek_tiktok_username: string | null
        notek_instagram_username: string | null
        miqat_tiktok_username: string | null
        miqat_instagram_username: string | null
        contract_id: number | null
        start_date: string | null
        end_date: string | null
        base_amount: number | null
        pay_timing: string | null
        first_pay_amount: number | null
        second_pay_amount: number | null
        details_done: boolean | null
      }>
    >,
  ])

  const contractIds = reposters
    .map((person) => person.contract_id)
    .filter((id): id is number => id != null && id > 0)
  const contractPayRows =
    contractIds.length === 0
      ? []
      : ((await sql`
          SELECT contract_id, paid_on::text AS paid_on, amount::float AS amount, note
          FROM payments
          WHERE contract_id = ANY(${contractIds}::int[])
          ORDER BY paid_on ASC, id ASC
        `) as Array<{ contract_id: number; paid_on: string; amount: number; note: string | null }>)
  const paysByContract = new Map<number, PayRow[]>()
  for (const row of contractPayRows) {
    const list = paysByContract.get(row.contract_id) ?? []
    list.push({ amount: Number(row.amount) || 0, paid_on: row.paid_on, note: row.note })
    paysByContract.set(row.contract_id, list)
  }

  const paysByKey = new Map<string, PayRow[]>()
  for (const row of payRows) {
    const list = paysByKey.get(row.subject_key) ?? []
    list.push({ amount: Number(row.amount) || 0, paid_on: row.paid_on, note: row.note })
    paysByKey.set(row.subject_key, list)
  }
  const slots: StructurePaySlot[] = []
  const names = new Map(structure.executives.map((row) => [row.id, row.name]))

  for (const role of [
    { tier: 'ceo' as const, title: 'CEO & Founder' },
    { tier: 'coo' as const, title: 'COO' },
    { tier: 'deputy_coo' as const, title: 'Deputy COO' },
  ]) {
    if (!canSeeStructureTier(viewerId, role.tier)) continue
    const key = `executive:${role.tier}`
    const saved = pays.get(key)
    slots.push({
      subjectKey: key,
      tier: role.tier,
      title: role.title,
      name: names.get(role.tier) || role.title,
      href: null,
      creatorId: null,
      contractId: null,
      start: saved?.start_date ?? null,
      end: saved?.end_date ?? null,
      timing: timingOf(saved?.pay_timing),
      amount: Number(saved?.base_amount) || 0,
      currency: currencyOf(saved?.pay_currency),
      scheduled: Boolean(saved),
      ...wavesFor({
        start: saved?.start_date ?? null,
        end: saved?.end_date ?? null,
        amount: Number(saved?.base_amount) || 0,
        timing: saved?.pay_timing ?? null,
        payments: paysByKey.get(key) ?? [],
        firstOverride: saved?.first_pay_amount ?? null,
        secondOverride: saved?.second_pay_amount ?? null,
        detailsDone: Boolean(saved?.details_done),
        today: day,
      }),
    })
  }

  if (canSeeStructureTier(viewerId, 'leader')) {
    for (const leader of leaders) {
      const key = `leader:${leader.id}`
      const saved = pays.get(key)
      slots.push({
        subjectKey: key,
        tier: 'leader',
        title: 'Leader',
        name: leader.name,
        href: `/admin/leaders/${leader.id}`,
        creatorId: null,
        contractId: null,
        start: saved?.start_date ?? leader.level_since,
        end: saved?.end_date ?? null,
        timing: timingOf(saved?.pay_timing) ?? (leader.monthly_pay ? 'fifteen' : null),
        amount: saved ? Number(saved.base_amount) || 0 : Number(leader.monthly_pay) || 0,
        currency: currencyOf(saved?.pay_currency ?? leader.pay_currency),
        scheduled: Boolean(saved),
        ...wavesFor({
          start: saved?.start_date ?? leader.level_since,
          end: saved?.end_date ?? null,
          amount: saved ? Number(saved.base_amount) || 0 : Number(leader.monthly_pay) || 0,
          timing: saved?.pay_timing ?? (leader.monthly_pay ? 'fifteen' : null),
          payments: paysByKey.get(key) ?? [],
          firstOverride: saved?.first_pay_amount ?? null,
          secondOverride: saved?.second_pay_amount ?? null,
          detailsDone: Boolean(saved?.details_done),
          today: day,
        }),
      })
    }
  }

  if (canSeeStructureTier(viewerId, 'outreach')) {
    for (const member of outreachRows) {
      if (member.creator_id || member.leader_id) continue
      const key = `outreach:${member.id}`
      const saved = pays.get(key)
      slots.push({
        subjectKey: key,
        tier: 'outreach',
        title: 'Outreach',
        name: member.name,
        href: null,
        creatorId: null,
        contractId: null,
        start: saved?.start_date ?? null,
        end: saved?.end_date ?? null,
        timing: timingOf(saved?.pay_timing),
        amount: Number(saved?.base_amount) || 0,
        currency: currencyOf(saved?.pay_currency),
        scheduled: Boolean(saved),
        ...wavesFor({
          start: saved?.start_date ?? null,
          end: saved?.end_date ?? null,
          amount: Number(saved?.base_amount) || 0,
          timing: saved?.pay_timing ?? null,
          payments: paysByKey.get(key) ?? [],
          firstOverride: saved?.first_pay_amount ?? null,
          secondOverride: saved?.second_pay_amount ?? null,
          detailsDone: Boolean(saved?.details_done),
          today: day,
        }),
      })
    }
  }

  if (canSeeStructureTier(viewerId, 'reposter')) {
    const listed = new Set(
      structure.reposters
        .map((person) => Number(person.key.replace('reposter:', '')))
        .filter((id) => id > 0),
    )
    for (const person of reposters) {
      if (listed.size > 0 && !listed.has(person.id)) continue
      slots.push({
        subjectKey: `reposter:${person.id}`,
        tier: 'reposter',
        title: 'Reposter',
        name: person.name,
        href: `/admin/creators/${person.id}?role=reposter&from=structure`,
        creatorId: person.id,
        contractId: person.contract_id,
        start: person.start_date,
        end: person.end_date,
        timing: person.start_date
          ? resolvePayTiming({
              stored: person.pay_timing,
              startDate: person.start_date,
              endDate: person.end_date,
            })
          : timingOf(person.pay_timing),
        amount: Number(person.base_amount) || 0,
        currency: currencyOf(person.pay_currency ?? (person.role === 'reposter' ? 'USD' : 'SAR')),
        scheduled: false,
        ...wavesFor({
          start: person.start_date,
          end: person.end_date,
          amount: Number(person.base_amount) || 0,
          timing: person.pay_timing,
          payments: person.contract_id ? (paysByContract.get(person.contract_id) ?? []) : [],
          firstOverride: person.first_pay_amount,
          secondOverride: person.second_pay_amount,
          detailsDone: Boolean(person.details_done),
          today: day,
        }),
        tiktok_username: person.tiktok_username,
        instagram_username: person.instagram_username,
        login_platform: person.login_platform,
        notek_tiktok_username: person.notek_tiktok_username,
        notek_instagram_username: person.notek_instagram_username,
        miqat_tiktok_username: person.miqat_tiktok_username,
        miqat_instagram_username: person.miqat_instagram_username,
      })
    }
  }

  return slots
}

export async function structureContractsForCalendar(
  viewerId: string | null | undefined,
  today?: string,
): Promise<CalendarContractInput[]> {
  const slots = await loadStructurePaySlots(viewerId, today)
  const out: CalendarContractInput[] = []
  for (const slot of slots) {
    if (slot.tier === 'reposter' || !slot.scheduled) continue
    if (!slot.start || slot.amount <= 0.009) continue
    const ids = structureCalendarIds(slot.subjectKey)
    out.push({
      contractId: ids.contractId,
      contractName: slot.title,
      startDate: slot.start,
      endDate: slot.end,
      baseAmount: slot.amount,
      commissionAmount: 0,
      basePayCadence: 'monthly',
      payTiming: slot.timing ?? 'fifteen',
      firstPayAmount: slot.firstOverride,
      secondPayAmount: slot.secondOverride,
      targetInstagram: 0,
      targetTiktok: 0,
      platforms: 'both',
      payEveryDays: 14,
      creatorId: ids.creatorId,
      creatorName: slot.name,
      role: 'creator',
      payCurrency: slot.currency,
      pausedAt: null,
      projectId: null,
      projectName: slot.title,
    })
  }
  return out
}

/** Recorded company salaries, using negative ids so they never match a creator payment. */
export async function structurePaymentsForCalendar(
  viewerId: string | null | undefined,
  today?: string,
): Promise<CalendarPaymentInput[]> {
  const slots = await loadStructurePaySlots(viewerId, today)
  const visible = new Map(
    slots.filter((slot) => slot.tier !== 'reposter' && slot.scheduled).map((slot) => [slot.subjectKey, slot]),
  )
  if (visible.size === 0) return []
  await ensureStructurePayTable()
  const rows = (await sql`
    SELECT id, subject_key, paid_on::text AS paid_on, amount::float AS amount, note
    FROM structure_payments
    ORDER BY paid_on ASC, id ASC
  `) as Array<{ id: number; subject_key: string; paid_on: string; amount: number; note: string | null }>
  const out: CalendarPaymentInput[] = []
  for (const row of rows) {
    const slot = visible.get(row.subject_key)
    if (!slot) continue
    const ids = structureCalendarIds(row.subject_key)
    out.push({
      id: -row.id,
      creatorId: ids.creatorId,
      contractId: ids.contractId,
      paidOn: row.paid_on,
      amount: Number(row.amount) || 0,
      note: row.note,
      creatorName: slot.name,
      role: 'creator',
      payCurrency: slot.currency,
      contractName: slot.title,
    })
  }
  return out
}
