'use server'

import { sql } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

function parseOptionalDate(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function parseSelectedIds(formData: FormData): number[] {
  const raw = formData.getAll('ids')
  const ids = new Set<number>()
  for (const value of raw) {
    const n = Number(value.toString())
    if (Number.isFinite(n) && n > 0) ids.add(Math.floor(n))
  }
  return [...ids]
}

/** Record the same payment amount for the selected reposters. */
export async function recordBulkReposterPayment(formData: FormData) {
  await requireAdmin()
  const paidOn = parseOptionalDate(formData.get('paid_on'))
  if (!paidOn) return { ok: false as const, error: 'Pick a payment date.' }
  const amount = parseAmount(formData.get('amount'))
  if (amount <= 0) return { ok: false as const, error: 'Enter an amount greater than 0.' }
  const noteRaw = (formData.get('note') ?? '').toString().trim()
  const note = noteRaw ? noteRaw.slice(0, 500) : `Bulk reposter pay ${amount}`
  const selectedIds = parseSelectedIds(formData)
  if (selectedIds.length === 0) {
    return { ok: false as const, error: 'Select at least one reposter to pay.' }
  }

  const allReposters = (await sql`
    SELECT id FROM creators WHERE role = 'reposter'
  `) as { id: number }[]
  const allowed = new Set(allReposters.map((r) => r.id))
  const reposters = selectedIds.filter((id) => allowed.has(id)).map((id) => ({ id }))

  if (reposters.length === 0) {
    return { ok: false as const, error: 'No matching reposters to pay.' }
  }

  for (const r of reposters) {
    const linked = (await sql`
      SELECT id FROM contracts
      WHERE creator_id = ${r.id}
        AND start_date <= ${paidOn}::date
        AND (end_date IS NULL OR end_date >= ${paidOn}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    const contractId = linked[0]?.id ?? null
    await sql`
      INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
      VALUES (${r.id}, ${contractId}, ${paidOn}, ${amount}, ${note})
    `
    await sql`UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${r.id}`
  }

  revalidatePath('/admin')
  revalidatePath('/submit')
  return { ok: true as const, count: reposters.length, amount, paidOn }
}
