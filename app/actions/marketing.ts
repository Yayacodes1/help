'use server'

import { sql } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { normalizeCurrency } from '@/lib/marketing'
import { getWalletTotals, paymentSource } from '@/lib/wallet'
import { revalidatePath } from 'next/cache'

/** Returns the admin account id (yahya / ahmed). */
async function requireAdmin(): Promise<string> {
  const session = await getAdminSession()
  if (!session) throw new Error('Unauthorized')
  return session.id
}

/** Only Yahya records or changes money sent to Ahmed. */
async function requireOwner(): Promise<string> {
  const session = await getAdminSession()
  if (session?.role !== 'owner') throw new Error('Only Yahya can do this')
  return session.id
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
  const by = await requireOwner()
  const sentOn = parseDate(formData.get('sent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200)
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!sentOn || amount <= 0) return
  await sql`
    INSERT INTO marketing_transfers (sent_on, amount, currency, label, note, project_id, recorded_by)
    VALUES (${sentOn}, ${amount}, ${currency}, ${label}, ${note}, ${projectId}, ${by})
  `
  revalidateMarketing()
}

export async function updateMarketingTransfer(id: number, formData: FormData) {
  await requireOwner()
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
  await requireOwner()
  await sql`DELETE FROM marketing_transfers WHERE id = ${id}`
  revalidateMarketing()
}

/** Log what money was used for. */
export async function createMarketingExpense(formData: FormData) {
  const by = await requireAdmin()
  const spentOn = parseDate(formData.get('spent_on'))
  const amount = parseAmount(formData.get('amount'))
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const label = parseText(formData.get('label'), 200) || 'Expense'
  const note = parseText(formData.get('note'), 2000)
  const projectId = parseProjectId(formData.get('project_id'))
  if (!spentOn || amount <= 0) return
  await sql`
    INSERT INTO marketing_expenses (spent_on, amount, currency, label, note, project_id, recorded_by)
    VALUES (${spentOn}, ${amount}, ${currency}, ${label}, ${note}, ${projectId}, ${by})
  `
  revalidateMarketing()
}

export async function updateMarketingExpense(id: number, formData: FormData) {
  await requireOwner()
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
  const by = await requireAdmin()
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
    INSERT INTO marketing_requests (needed_by, currency, status, title, note, project_id, recorded_by)
    VALUES (${neededBy}, ${currency}, 'open', ${title}, ${note}, ${projectId}, ${by})
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

/**
 * Close a request as money in. Yahya marks it sent; Ahmed marks it received.
 * `amount` is what actually arrived (defaults to the full request).
 */
export async function fulfillMarketingRequest(id: number, formData: FormData) {
  const by = await requireAdmin()
  const sentOn = parseDate(formData.get('sent_on')) ?? new Date().toISOString().slice(0, 10)
  const label = parseText(formData.get('label'), 200)
  const note = parseText(formData.get('note'), 2000)
  const typedAmount = parseAmount(formData.get('amount'))

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
  const received = typedAmount > 0 ? typedAmount : total
  if (received <= 0) return

  const currency = normalizeCurrency(req.currency)
  const transferLabel = label || req.title || `Request #${id}`
  const partial = Math.abs(received - total) > 0.009
  const fullNote = partial
    ? [`Received ${received.toFixed(2)} of ${total.toFixed(2)} asked`, note].filter(Boolean).join(' · ')
    : note

  await sql`
    INSERT INTO marketing_transfers (sent_on, amount, currency, label, note, project_id, recorded_by)
    VALUES (${sentOn}, ${received}, ${currency}, ${transferLabel}, ${fullNote}, ${req.project_id}, ${by})
  `
  await sql`
    UPDATE marketing_requests SET status = 'fulfilled', received_amount = ${received} WHERE id = ${id}
  `
  revalidateMarketing()
}

/**
 * Ahmed says how much he actually has. Records the difference from the app's
 * "left" so the wallet matches his real balance.
 */
export async function setWalletBalance(formData: FormData) {
  const by = await requireAdmin()
  const raw = Number((formData.get('amount') ?? '').toString())
  if (!Number.isFinite(raw)) return { ok: false as const, error: 'Enter an amount.' }
  const counted = Math.round(raw * 100) / 100
  const currency = normalizeCurrency((formData.get('currency') ?? '').toString())
  const on = parseDate(formData.get('counted_on')) ?? new Date().toISOString().slice(0, 10)
  const note = parseText(formData.get('note'), 500)
  const totals = await getWalletTotals()
  const left = totals.find((t) => t.currency === currency)?.left ?? 0
  const diff = Math.round((counted - left) * 100) / 100
  await sql`
    INSERT INTO wallet_adjustments (adjusted_on, amount, counted, currency, note, recorded_by)
    VALUES (${on}, ${diff}, ${counted}, ${currency}, ${note}, ${by})
  `
  revalidateMarketing()
  return { ok: true as const, diff, counted, currency }
}

export async function deleteWalletAdjustment(id: number) {
  await requireAdmin()
  await sql`DELETE FROM wallet_adjustments WHERE id = ${id}`
  revalidateMarketing()
}

export type MoneyRequestInput = {
  title: string
  neededBy: string | null
  currency: string
  note: string
  items: Array<{ reason: string; amount: number }>
}

/** Ask Yahya for money: one request with any number of lines. */
export async function createMoneyRequest(input: MoneyRequestInput) {
  const by = await requireAdmin()
  const items = input.items
    .map((i) => ({
      reason: i.reason.trim().slice(0, 500),
      amount: Math.round(Math.max(0, Number(i.amount) || 0) * 100) / 100,
    }))
    .filter((i) => i.reason && i.amount > 0)
    .slice(0, 300)
  if (items.length === 0) return { ok: false as const, error: 'Add at least one line with an amount.' }
  const neededBy = input.neededBy && /^\d{4}-\d{2}-\d{2}$/.test(input.neededBy) ? input.neededBy : null
  const rows = (await sql`
    INSERT INTO marketing_requests (needed_by, currency, status, title, note, recorded_by)
    VALUES (${neededBy}, ${normalizeCurrency(input.currency)}, 'open',
            ${input.title.trim().slice(0, 200) || null}, ${input.note.trim().slice(0, 2000) || null}, ${by})
    RETURNING id
  `) as { id: number }[]
  const requestId = rows[0]?.id
  if (requestId == null) return { ok: false as const, error: 'Could not save the request.' }
  for (const item of items) {
    await sql`
      INSERT INTO marketing_request_items (request_id, amount, reason)
      VALUES (${requestId}, ${item.amount}, ${item.reason})
    `
  }
  revalidateMarketing()
  return { ok: true as const, total: items.reduce((s, i) => s + i.amount, 0) }
}

export type WalletPaymentInput = {
  paidOn: string
  note: string
  /** Yahya only: 'ahmed' = from Ahmed's wallet, 'direct' = Yahya paid them himself. */
  paidFrom: 'ahmed' | 'direct'
  entries: Array<{ creatorId: number; amount: number }>
}

/** Pay many people at once (each gets their own amount). */
export async function recordWalletPayments(input: WalletPaymentInput) {
  await requireAdmin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return { ok: false as const, error: 'Pick a date.' }
  const entries = input.entries
    .map((e) => ({
      creatorId: Math.floor(Number(e.creatorId)),
      amount: Math.round(Math.max(0, Number(e.amount) || 0) * 100) / 100,
    }))
    .filter((e) => e.creatorId > 0 && e.amount > 0)
  if (entries.length === 0) return { ok: false as const, error: 'Tick at least one person and enter an amount.' }

  const known = (await sql`SELECT id FROM creators`) as { id: number }[]
  const allowed = new Set(known.map((r) => r.id))
  const source = await paymentSource(input.paidFrom)
  const note = input.note.trim().slice(0, 500) || null
  let count = 0
  let total = 0
  for (const e of entries) {
    if (!allowed.has(e.creatorId)) continue
    const linked = (await sql`
      SELECT id FROM contracts
      WHERE creator_id = ${e.creatorId}
        AND start_date <= ${input.paidOn}::date
        AND (end_date IS NULL OR end_date >= ${input.paidOn}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    await sql`
      INSERT INTO payments (creator_id, contract_id, paid_on, amount, note, paid_by, recorded_by)
      VALUES (${e.creatorId}, ${linked[0]?.id ?? null}, ${input.paidOn}, ${e.amount}, ${note},
              ${source.paidBy}, ${source.recordedBy})
    `
    await sql`UPDATE creators SET last_paid_at = GREATEST(COALESCE(last_paid_at, ${input.paidOn}::date), ${input.paidOn}::date) WHERE id = ${e.creatorId}`
    count++
    total += e.amount
  }
  revalidatePath('/admin')
  revalidatePath('/submit')
  return { ok: true as const, count, total, fromWallet: source.paidBy === 'ahmed' }
}
