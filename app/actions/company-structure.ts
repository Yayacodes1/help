'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/admin-auth'
import { EXECUTIVE_ROLES, type ExecutiveRoleId } from '@/lib/company-roles'
import { saveExecutiveName } from '@/lib/company-structure'

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
