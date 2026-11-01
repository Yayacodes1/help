'use server'

import { revalidatePath } from 'next/cache'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import { canSeeStructureTier } from '@/lib/admin-access'
import { EXECUTIVE_ROLES, type ExecutiveRoleId, type StructurePayTiming } from '@/lib/company-roles'
import { saveExecutiveName } from '@/lib/company-structure'
import { ensureStructurePayTable, tierFromSubjectKey } from '@/lib/structure-pay'

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
  if (!tier || tier === 'reposter' || !canSeeStructureTier(session.id, tier)) {
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
  await sqlSave(subjectKey, start, end, timing, amount, currency)
  revalidatePath('/admin')
  revalidatePath('/admin/payments', 'layout')
  return { ok: true as const }
}

async function sqlSave(
  subjectKey: string,
  start: string,
  end: string | null,
  timing: StructurePayTiming,
  amount: number,
  currency: 'SAR' | 'USD',
) {
  const { sql } = await import('@/lib/db')
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
      updated_at = NOW()
  `
}
