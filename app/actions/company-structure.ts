'use server'

import { revalidatePath } from 'next/cache'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import { canSeeStructureTier } from '@/lib/admin-access'
import { EXECUTIVE_ROLES, type ExecutiveRoleId, type StructurePayTiming } from '@/lib/company-roles'
import { saveExecutiveName } from '@/lib/company-structure'
import { ensureStructurePayTable, subjectKeyFromCalendarId, tierFromSubjectKey } from '@/lib/structure-pay'
import { contractWaveStatus, halfIndexFromNote } from '@/lib/contract-halves'
import { getOperationalToday } from '@/lib/queries'

function isExecutiveRole(value: string): value is ExecutiveRoleId {
  return EXECUTIVE_ROLES.some((role) => role.id === value)
}

export async function saveCompanyRoleName(formData: FormData) {
  if (!(await isAdmin())) throw new Error('Unauthorized')
  const role = (formData.get('role') ?? '').toString()
  if (!isExecutiveRole(role)) return { ok: false as const, error: 'Unknown role.' }
  const raw = (formData.get('name') ?? '').toString()
  await saveExecutiveName(role, raw)
  revalidatePath('/admin')
  return { ok: true as const }
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

function parseDate(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function parseTiming(value: FormDataEntryValue | null): StructurePayTiming {
  const raw = (value ?? '').toString()
  return raw === 'upfront' || raw === 'end' ? raw : 'fifteen'
}

/** Company structure pay for executives, leaders, and standalone outreach. Reposters use their creator contract. */
export async function saveStructureContract(formData: FormData) {
  const session = await getAdminSession()
  if (!session) throw new Error('Unauthorized')
  const subjectKey = (formData.get('subject_key') ?? '').toString().trim()
  const tier = tierFromSubjectKey(subjectKey)
  if (!tier || tier === 'reposter' || tier === 'ceo' || !canSeeStructureTier(session.id, tier)) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const start = parseDate(formData.get('start_date'))
  const end = parseDate(formData.get('end_date'))
  const timing = parseTiming(formData.get('pay_timing'))
  const amount = parseAmount(formData.get('base_amount'))
  const currency = (formData.get('pay_currency') ?? '').toString() === 'USD' ? 'USD' : 'SAR'
  if (!start) return { ok: false as const, message: 'Start date is required.' }
  if (end && end < start) return { ok: false as const, message: 'End cannot be before start.' }
  if (timing === 'end' && !end) return { ok: false as const, message: 'End date is required for a one-time payment.' }
  await ensureStructurePayTable()
  const { sql } = await import('@/lib/db')
  const previous = (await sql`
    SELECT base_amount::float AS base_amount, pay_timing
    FROM structure_contracts
    WHERE subject_key = ${subjectKey}
    LIMIT 1
  `) as { base_amount: number; pay_timing: string | null }[]
  const prior = previous[0]
  const resetWaves =
    !prior ||
    Math.round((Number(prior.base_amount) || 0) * 100) !== Math.round(amount * 100) ||
    (prior.pay_timing ?? 'fifteen') !== timing
  await sql`
    INSERT INTO structure_contracts (
      subject_key, start_date, end_date, pay_timing, base_amount, pay_currency, updated_at
    )
    VALUES (${subjectKey}, ${start}, ${end}, ${timing}, ${amount}, ${currency}, NOW())
    ON CONFLICT (subject_key) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      pay_timing = EXCLUDED.pay_timing,
      base_amount = EXCLUDED.base_amount,
      pay_currency = EXCLUDED.pay_currency,
      first_pay_amount = CASE WHEN ${resetWaves} THEN NULL ELSE structure_contracts.first_pay_amount END,
      second_pay_amount = CASE WHEN ${resetWaves} THEN NULL ELSE structure_contracts.second_pay_amount END,
      first_pay_on = CASE WHEN ${resetWaves} THEN NULL ELSE structure_contracts.first_pay_on END,
      second_pay_on = CASE WHEN ${resetWaves} THEN NULL ELSE structure_contracts.second_pay_on END,
      pay_slice_overrides = CASE WHEN ${resetWaves} THEN '{}'::jsonb ELSE structure_contracts.pay_slice_overrides END,
      updated_at = NOW()
  `
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

async function editableStructure(subjectKey: string) {
  const session = await getAdminSession()
  if (!session) throw new Error('Unauthorized')
  const tier = tierFromSubjectKey(subjectKey)
  if (!tier || tier === 'reposter' || tier === 'ceo' || !canSeeStructureTier(session.id, tier)) return null
  await ensureStructurePayTable()
  return { session, tier }
}

/** Set the first and second company-structure payment by hand. */
export async function saveStructureWaveAmounts(formData: FormData) {
  const subjectKey = (formData.get('subject_key') ?? '').toString().trim()
  if (!(await editableStructure(subjectKey))) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const { sql } = await import('@/lib/db')
  const rows = (await sql`
    SELECT pay_timing, end_date::text AS end_date
    FROM structure_contracts
    WHERE subject_key = ${subjectKey}
    LIMIT 1
  `) as { pay_timing: string | null; end_date: string | null }[]
  if (!rows[0]) return { ok: false as const, message: 'Save the contract first.' }
  const oneTime = rows[0].pay_timing === 'end' || !rows[0].end_date
  const first = parseAmount(formData.get('first_amount'))
  const second = oneTime ? null : parseAmount(formData.get('second_amount'))
  const firstOn = parseDate(formData.get('first_on'))
  const secondOn = oneTime ? null : parseDate(formData.get('second_on'))
  await sql`
    UPDATE structure_contracts
    SET first_pay_amount = ${first},
        second_pay_amount = ${second},
        first_pay_on = ${firstOn},
        second_pay_on = ${secondOn},
        updated_at = NOW()
    WHERE subject_key = ${subjectKey}
  `
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

/** Record the remaining first or second company-structure payment. */
export async function recordStructureHalf(subjectKey: string, which: 'first' | 'second') {
  if (!(await editableStructure(subjectKey))) return { ok: false as const, message: 'You cannot edit this pay.' }
  const { sql } = await import('@/lib/db')
  const rows = (await sql`
    SELECT start_date::text AS start_date, end_date::text AS end_date,
           pay_timing, base_amount::float AS base_amount,
           first_pay_amount::float AS first_pay_amount,
           second_pay_amount::float AS second_pay_amount
    FROM structure_contracts
    WHERE subject_key = ${subjectKey}
    LIMIT 1
  `) as {
    start_date: string
    end_date: string | null
    pay_timing: string | null
    base_amount: number
    first_pay_amount: number | null
    second_pay_amount: number | null
  }[]
  const contract = rows[0]
  if (!contract) return { ok: false as const, message: 'Save the contract first.' }
  const payments = (await sql`
    SELECT amount::float AS amount, paid_on::text AS paid_on, note
    FROM structure_payments
    WHERE subject_key = ${subjectKey}
    ORDER BY paid_on ASC, id ASC
  `) as { amount: number; paid_on: string; note: string | null }[]
  const waves = contractWaveStatus({
    start: contract.start_date,
    end: contract.end_date,
    minDue: Number(contract.base_amount) || 0,
    payments,
    timing: contract.pay_timing,
    firstAmount: contract.first_pay_amount,
    secondAmount: contract.second_pay_amount,
  })
  const balance = which === 'first' ? waves.firstBalance : waves.secondBalance
  if (balance <= 0.009) return { ok: true as const }
  const today = await getOperationalToday()
  const note = which === 'first' ? '1st payment' : '2nd payment'
  await sql`
    INSERT INTO structure_payments (subject_key, paid_on, amount, note)
    VALUES (${subjectKey}, ${today}, ${balance}, ${note})
  `
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

export async function setStructureDetailsDone(subjectKey: string, done: boolean) {
  if (!(await editableStructure(subjectKey))) return { ok: false as const }
  const { sql } = await import('@/lib/db')
  const updated = (await sql`
    UPDATE structure_contracts
    SET details_done = ${done}, updated_at = NOW()
    WHERE subject_key = ${subjectKey}
    RETURNING subject_key
  `) as { subject_key: string }[]
  if (!updated[0]) return { ok: false as const }
  revalidatePath('/admin')
  return { ok: true as const }
}

/** People to pay: move one company salary installment. */
export async function saveStructureInstallment(formData: FormData) {
  const creatorId = Math.floor(Number(formData.get('creator_id')))
  const subjectKey = subjectKeyFromCalendarId(creatorId)
  if (!subjectKey || !(await editableStructure(subjectKey))) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const index = Math.floor(Number(formData.get('installment_index')))
  const payOn = parseDate(formData.get('pay_on'))
  if (!payOn || !Number.isFinite(index) || index < 0 || index > 36) {
    return { ok: false as const, message: 'Pick a date.' }
  }
  const amount = parseAmount(formData.get('amount'))
  const { sql } = await import('@/lib/db')
  if (index === 0) {
    await sql`
      UPDATE structure_contracts
      SET first_pay_on = ${payOn}, first_pay_amount = ${amount}, updated_at = NOW()
      WHERE subject_key = ${subjectKey}
    `
  } else if (index === 1) {
    await sql`
      UPDATE structure_contracts
      SET second_pay_on = ${payOn}, second_pay_amount = ${amount}, updated_at = NOW()
      WHERE subject_key = ${subjectKey}
    `
  } else {
    const rows = (await sql`
      SELECT pay_slice_overrides
      FROM structure_contracts
      WHERE subject_key = ${subjectKey}
      LIMIT 1
    `) as { pay_slice_overrides: unknown }[]
    if (!rows[0]) return { ok: false as const, message: 'Save the contract first.' }
    const overrides = readSliceOverrides(rows[0].pay_slice_overrides)
    overrides[String(index)] = { on: payOn, amount }
    await sql`
      UPDATE structure_contracts
      SET pay_slice_overrides = ${JSON.stringify(overrides)}::jsonb, updated_at = NOW()
      WHERE subject_key = ${subjectKey}
    `
  }
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

/** Marketing by month: company salary is biweekly (the amount each pay) or monthly (the amount is the full month). */
export async function setStructurePayCadence(formData: FormData) {
  const creatorId = Math.floor(Number(formData.get('creator_id')))
  const subjectKey = subjectKeyFromCalendarId(creatorId)
  if (!subjectKey || !(await editableStructure(subjectKey))) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const cadence = formData.get('base_pay_cadence') === 'biweekly' ? 'biweekly' : 'monthly'
  const { sql } = await import('@/lib/db')
  await ensureStructurePayTable()
  const rows = (await sql`
    SELECT pay_slice_overrides
    FROM structure_contracts
    WHERE subject_key = ${subjectKey}
    LIMIT 1
  `) as { pay_slice_overrides: unknown }[]
  if (!rows[0]) return { ok: false as const, message: 'Save the contract first.' }
  const dates = datesOnlyOverrides(rows[0].pay_slice_overrides)
  await sql`
    UPDATE structure_contracts
    SET base_pay_cadence = ${cadence},
        first_pay_amount = NULL,
        second_pay_amount = NULL,
        pay_slice_overrides = ${JSON.stringify(dates)}::jsonb,
        updated_at = NOW()
    WHERE subject_key = ${subjectKey}
  `
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

function datesOnlyOverrides(value: unknown): Record<string, { on: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, { on: string }> = {}
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const on = (row as { on?: unknown }).on
    if (typeof on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(on)) out[key] = { on }
  }
  return out
}

/** Record a company salary installment for the amount typed on the calendar day. */
export async function payStructureAmount(subjectKey: string, installmentIndex: number, amount: number) {
  if (!(await editableStructure(subjectKey))) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const pay = Math.round(Number(amount) * 100) / 100
  if (!(pay > 0)) return { ok: false as const, message: 'Enter an amount.' }
  const { sql } = await import('@/lib/db')
  const today = await getOperationalToday()
  const note = installmentIndex === 0 ? '1st payment' : '2nd payment'
  await sql`
    INSERT INTO structure_payments (subject_key, paid_on, amount, note)
    VALUES (${subjectKey}, ${today}, ${pay}, ${note})
  `
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

/** Remove the company salary payment that settled this installment. */
export async function unpayStructureInstallment(subjectKey: string, installmentIndex: number) {
  if (!(await editableStructure(subjectKey))) {
    return { ok: false as const, message: 'You cannot edit this pay.' }
  }
  const { sql } = await import('@/lib/db')
  const wave = installmentIndex === 0 ? 1 : 2
  const rows = (await sql`
    SELECT id, note
    FROM structure_payments
    WHERE subject_key = ${subjectKey}
    ORDER BY paid_on DESC, id DESC
  `) as { id: number; note: string | null }[]
  const match = rows.find((row) => halfIndexFromNote(row.note) === wave) ?? rows[0]
  if (!match) return { ok: true as const }
  await sql`DELETE FROM structure_payments WHERE id = ${match.id} AND subject_key = ${subjectKey}`
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

function readSliceOverrides(value: unknown): Record<string, { on?: string; amount?: number }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, { on?: string; amount?: number }> = {}
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const item = row as { on?: unknown; amount?: unknown }
    const on = typeof item.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.on) ? item.on : undefined
    const amountNumber = Number(item.amount)
    out[key] = {
      on,
      amount: Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) / 100 : undefined,
    }
  }
  return out
}
