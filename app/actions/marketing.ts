'use server'

import { sql } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'
import { normalizeCurrency } from '@/lib/marketing'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

function parseDate(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function parseText(value: FormDataEntryValue | null, max = 500): string | null {
  const raw = (value ?? '').toString().trim()
  return raw ? raw.slice(0, max) : null
}

function parseProjectId(value: FormDataEntryValue | null): number | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function revalidateMarketing() {
  revalidatePath('/admin')
}

/** Record money sent to marketing. */
export async function createMarketingTransfer(formData: FormData) {
  await requireAdmin()
  const sentOn = parseDate(formData.get('sent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200)
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!sentOn || amount <= 0) return
  await sql`
    INSERT INTO marketing_transfers (sent_on, amount, currency, label, note, project_id)
    VALUES (${sentOn}, ${amount}, ${currency}, ${label}, ${note}, ${projectId})
  `
  revalidateMarketing()
}

export async function updateMarketingTransfer(id: number, formData: FormData) {
  await requireAdmin()
  const sentOn = parseDate(formData.get('sent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200)
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!sentOn || amount <= 0) return
  await sql`
    UPDATE marketing_transfers
    SET sent_on = ${sentOn}, amount = ${amount}, currency = ${currency},
        label = ${label}, note = ${note},
        project_id = COALESCE(${projectId}, project_id)
    WHERE id = ${id}
  `
  revalidateMarketing()
}

export async function deleteMarketingTransfer(id: number) {
  await requireAdmin()
  await sql`DELETE FROM marketing_transfers WHERE id = ${id}`
  revalidateMarketing()
}

/** Log what money was used for. */
export async function createMarketingExpense(formData: FormData) {
  await requireAdmin()
  const spentOn = parseDate(formData.get('spent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200) || 'Expense'
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!spentOn || amount <= 0) return
  await sql`
    INSERT INTO marketing_expenses (spent_on, amount, currency, label, note, project_id)
    VALUES (${spentOn}, ${amount}, ${currency}, ${label}, ${note}, ${projectId})
  `
  revalidateMarketing()
}

export async function updateMarketingExpense(id: number, formData: FormData) {
  await requireAdmin()
  const spentOn = parseDate(formData.get('spent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200) || 'Expense'
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!spentOn || amount <= 0) return
  await sql`
    UPDATE marketing_expenses
    SET spent_on = ${spentOn}, amount = ${amount}, currency = ${currency},
        label = ${label}, note = ${note},
        project_id = COALESCE(${projectId}, project_id)
    WHERE id = ${id}
  `
  revalidateMarketing()
}

export async function deleteMarketingExpense(id: number) {
  await requireAdmin()
  await sql`DELETE FROM marketing_expenses WHERE id = ${id}`
  revalidateMarketing()
}

/**
 * Request money — one or more reasons via reason_0 / amount_0, …
 * Or a single reason + amount.
 */
export async function createMarketingRequest(formData: FormData) {
  await requireAdmin()
  const neededBy = parseDate(formData.get('needed_by'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const title = parseText(formData.get('title'), 200)
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))

  const items: { amount: number; reason: string }[] = []
  for (let i = 0; i < 20; i++) {
    const reason = parseText(formData.get(`reason_${i}`), 500)
    const amount = parseAmount(formData.get(`amount_${i}`))
    if (reason && amount > 0) items.push({ reason, amount })
  }
  if (items.length === 0) {
    const reason = parseText(formData.get('reason'), 500)
    const amount = parseAmount(formData.get('amount'))
    if (reason && amount > 0) items.push({ reason, amount })
  }
  if (items.length === 0) return

  const rows = (await sql`
    INSERT INTO marketing_requests (needed_by, currency, status, title, note, project_id)
    VALUES (${neededBy}, ${currency}, 'open', ${title}, ${note}, ${projectId})
    RETURNING id
  `) as { id: number }[]
  const requestId = rows[0]?.id
  if (requestId == null) return

  for (const item of items) {
    await sql`
      INSERT INTO marketing_request_items (request_id, amount, reason)
      VALUES (${requestId}, ${item.amount}, ${item.reason})
    `
  }
  revalidateMarketing()
}

export async function cancelMarketingRequest(id: number) {
  await requireAdmin()
  await sql`
    UPDATE marketing_requests SET status = 'cancelled' WHERE id = ${id} AND status = 'open'
  `
  revalidateMarketing()
}

/** Fulfill a request by recording a transfer for the total. */
export async function fulfillMarketingRequest(id: number, formData: FormData) {
  await requireAdmin()
  const sentOn = parseDate(formData.get('sent_on')) ?? new Date().toISOString().slice(0, 10)
  const label = parseText(formData.get('label'), 200)
  const note = parseText(formData.get('note'), 2000)

  const reqRows = (await sql`
    SELECT id, currency, status, title, project_id FROM marketing_requests WHERE id = ${id} LIMIT 1
  `) as {
    id: number
    currency: string
    status: string
    title: string | null
    project_id: number | null
  }[]
  const req = reqRows[0]
  if (!req || req.status !== 'open') return

  const sumRows = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS total
    FROM marketing_request_items WHERE request_id = ${id}
  `) as { total: number }[]
  const total = Number(sumRows[0]?.total) || 0
  if (total <= 0) return

  const currency = normalizeCurrency(req.currency)
  const transferLabel = label || req.title || `Request #${id}`

  await sql`
    INSERT INTO marketing_transfers (sent_on, amount, currency, label, note, project_id)
    VALUES (${sentOn}, ${total}, ${currency}, ${transferLabel}, ${note}, ${req.project_id})
  `
  await sql`UPDATE marketing_requests SET status = 'fulfilled' WHERE id = ${id}`
  revalidateMarketing()
}
