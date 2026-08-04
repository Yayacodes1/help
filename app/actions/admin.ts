'use server'

import { randomBytes } from 'crypto'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import {
  applyPlatformsToQuotas,
  normalizePlatforms,
  type PlatformsMode,
} from '@/lib/platforms-mode'
import {
  createAdminSession,
  destroyAdminSession,
  isAdmin,
  verifyPassword,
} from '@/lib/admin-auth'
import { getPaidForContract, getServerToday } from '@/lib/queries'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

function parseGoal(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
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

function parsePayEveryDays(value: FormDataEntryValue | null): number {
  const n = Number((value ?? '').toString())
  if (!Number.isFinite(n) || n < 1) return 14
  return Math.min(365, Math.floor(n))
}

function parseNotes(value: FormDataEntryValue | null): string | null {
  const raw = (value ?? '').toString().trim()
  return raw ? raw.slice(0, 2000) : null
}

function parseOptionalAmount(value: FormDataEntryValue | null): number | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/** Empty field → leave previous value; filled → new number (incl. 0). */
function parseAmountOrKeep(
  value: FormDataEntryValue | null,
  previous: number,
): number {
  const raw = (value ?? '').toString().trim()
  if (!raw) return previous
  return parseAmount(value)
}

function parseOptionalAmountOrKeep(
  value: FormDataEntryValue | null,
  previous: number | null,
): number | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return previous
  return parseOptionalAmount(value)
}

function parsePlatforms(value: FormDataEntryValue | null): PlatformsMode {
  return normalizePlatforms((value ?? '').toString())
}

function parseContractQuotas(
  formData: FormData,
  previous?: { baseAmount: number; commissionAmount: number | null },
) {
  const platforms = parsePlatforms(formData.get('platforms'))
  const raw = {
    goalInstagram: parseGoal(formData.get('goal_instagram')),
    goalTiktok: parseGoal(formData.get('goal_tiktok')),
    targetInstagram: parseGoal(formData.get('target_instagram')),
    targetTiktok: parseGoal(formData.get('target_tiktok')),
    baseAmount: previous
      ? parseAmountOrKeep(formData.get('base_amount'), previous.baseAmount)
      : parseAmount(formData.get('base_amount')),
    commissionAmount: previous
      ? parseOptionalAmountOrKeep(
          formData.get('commission_amount'),
          previous.commissionAmount,
        )
      : parseOptionalAmount(formData.get('commission_amount')),
  }
  const q = applyPlatformsToQuotas(platforms, raw)
  return { ...q, platforms }
}

// --- Auth ---

export async function login(_prev: unknown, formData: FormData) {
  const password = (formData.get('password') ?? '').toString()
  if (!verifyPassword(password)) {
    return { ok: false, message: 'Incorrect password.' }
  }
  await createAdminSession()
  redirect('/admin')
}

export async function logout() {
  await destroyAdminSession()
  redirect('/login')
}

// --- Projects ---

export async function createProject(formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  if (!name) return
  await sql`INSERT INTO projects (name) VALUES (${name})`
  revalidatePath('/admin')
}

export async function deleteProject(id: number) {
  await requireAdmin()
  await sql`UPDATE creators SET project_id = NULL WHERE project_id = ${id}`
  await sql`UPDATE submissions SET project_id = NULL WHERE project_id = ${id}`
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath('/admin')
}

// --- Creators ---

export async function createCreator(formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const projectIdRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectIdRaw ? Number(projectIdRaw) : null
  if (!name) return
  const platforms = parsePlatforms(formData.get('platforms'))
  const goals = applyPlatformsToQuotas(platforms, {
    goalInstagram: parseGoal(formData.get('goal_instagram')),
    goalTiktok: parseGoal(formData.get('goal_tiktok')),
    targetInstagram: 0,
    targetTiktok: 0,
  })
  const lastPaidAt = parseOptionalDate(formData.get('last_paid_at'))
  const payEveryDays = parsePayEveryDays(formData.get('pay_every_days'))
  const notes = parseNotes(formData.get('notes'))
  const token = randomBytes(12).toString('hex')
  const rows = (await sql`
    INSERT INTO creators (
      name, token, project_id, goal_instagram, goal_tiktok, platforms,
      last_paid_at, pay_every_days, notes
    )
    VALUES (
      ${name}, ${token}, ${projectId}, ${goals.goalInstagram}, ${goals.goalTiktok}, ${platforms},
      ${lastPaidAt}, ${payEveryDays}, ${notes}
    )
    RETURNING id
  `) as { id: number }[]

  const creatorId = rows[0]?.id
  const contractName = (formData.get('contract_name') ?? '').toString().trim() || 'Initial contract'
  const contractStart = parseOptionalDate(formData.get('contract_start'))
  if (creatorId && contractStart) {
    await sql`
      INSERT INTO contracts (
        creator_id, name, start_date, end_date,
        goal_instagram, goal_tiktok, platforms
      )
      VALUES (
        ${creatorId}, ${contractName}, ${contractStart}, NULL,
        ${goals.goalInstagram}, ${goals.goalTiktok}, ${platforms}
      )
    `
  }

  revalidatePath('/admin')
}

export async function updateCreator(id: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const projectIdRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectIdRaw ? Number(projectIdRaw) : null
  if (!name) return
  const platforms = parsePlatforms(formData.get('platforms'))
  const goals = applyPlatformsToQuotas(platforms, {
    goalInstagram: parseGoal(formData.get('goal_instagram')),
    goalTiktok: parseGoal(formData.get('goal_tiktok')),
    targetInstagram: 0,
    targetTiktok: 0,
  })
  const lastPaidAt = parseOptionalDate(formData.get('last_paid_at'))
  const payEveryDays = parsePayEveryDays(formData.get('pay_every_days'))
  const notes = parseNotes(formData.get('notes'))
  await sql`
    UPDATE creators
    SET name = ${name}, project_id = ${projectId},
        goal_instagram = ${goals.goalInstagram}, goal_tiktok = ${goals.goalTiktok},
        platforms = ${platforms},
        last_paid_at = ${lastPaidAt}, pay_every_days = ${payEveryDays},
        notes = ${notes}
    WHERE id = ${id}
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${id}`)
  revalidatePath('/submit')
}

export async function markCreatorPaid(id: number, formData: FormData) {
  await requireAdmin()
  const paidOn = parseOptionalDate(formData.get('paid_on'))
  const date = paidOn ?? new Date().toISOString().slice(0, 10)
  const amount = parseAmount(formData.get('amount'))
  const noteRaw = (formData.get('note') ?? '').toString().trim()
  const note = noteRaw ? noteRaw.slice(0, 500) : null
  const contractRaw = (formData.get('contract_id') ?? '').toString()
  const contractId = contractRaw ? Number(contractRaw) : null

  await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${id}, ${contractId}, ${date}, ${amount}, ${note})
  `
  await sql`UPDATE creators SET last_paid_at = ${date} WHERE id = ${id}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${id}`)
  revalidatePath('/submit')
}

export async function deleteCreator(id: number) {
  await requireAdmin()
  await sql`DELETE FROM payments WHERE creator_id = ${id}`
  await sql`DELETE FROM contracts WHERE creator_id = ${id}`
  await sql`DELETE FROM submissions WHERE creator_id = ${id}`
  await sql`DELETE FROM creators WHERE id = ${id}`
  revalidatePath('/admin')
}

// --- Contracts ---

export async function createContract(creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  const end = parseOptionalDate(formData.get('end_date'))
  if (!name || !start) return
  if (end && end < start) return
  const q = parseContractQuotas(formData)

  await sql`
    INSERT INTO contracts (
      creator_id, name, start_date, end_date,
      goal_instagram, goal_tiktok, target_instagram, target_tiktok,
      platforms, base_amount, commission_amount
    )
    VALUES (
      ${creatorId}, ${name}, ${start}, ${end},
      ${q.goalInstagram}, ${q.goalTiktok}, ${q.targetInstagram}, ${q.targetTiktok},
      ${q.platforms}, ${q.baseAmount}, ${q.commissionAmount}
    )
  `

  if (end) {
    const today = await getServerToday()
    if (end <= today) {
      const inserted = (await sql`
        SELECT id FROM contracts
        WHERE creator_id = ${creatorId} AND name = ${name} AND start_date = ${start}::date
        ORDER BY id DESC LIMIT 1
      `) as { id: number }[]
      if (inserted[0]) {
        await syncPaymentFromEndedContractTerms({
          creatorId,
          contractId: inserted[0].id,
          name,
          start,
          end,
          baseAmount: q.baseAmount,
          commissionAmount: q.commissionAmount,
          today,
        })
      }
    }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

export async function startNewContract(creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  const end = parseOptionalDate(formData.get('end_date'))
  if (!name || !start) return
  if (end && end < start) return
  const q = parseContractQuotas(formData)

  // Close any open/overlapping period so the new one is clearly current.
  const covering = (await sql`
    SELECT id, start_date::text AS start_date
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${start}::date
      AND (end_date IS NULL OR end_date >= ${start}::date)
    ORDER BY start_date DESC, id DESC
  `) as { id: number; start_date: string }[]

  for (const row of covering) {
    const prevEnd =
      start <= row.start_date ? row.start_date : addDays(start, -1)
    await sql`UPDATE contracts SET end_date = ${prevEnd} WHERE id = ${row.id}`
  }

  await sql`
    INSERT INTO contracts (
      creator_id, name, start_date, end_date,
      goal_instagram, goal_tiktok, target_instagram, target_tiktok,
      platforms, base_amount, commission_amount
    )
    VALUES (
      ${creatorId}, ${name}, ${start}, ${end},
      ${q.goalInstagram}, ${q.goalTiktok}, ${q.targetInstagram}, ${q.targetTiktok},
      ${q.platforms}, ${q.baseAmount}, ${q.commissionAmount}
    )
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

/**
 * On ended contracts, money you type (base + commission) is what you paid her.
 * Create/top-up a payment so Total paid and Pay due update automatically.
 */
async function syncPaymentFromEndedContractTerms(input: {
  creatorId: number
  contractId: number
  name: string
  start: string
  end: string
  baseAmount: number
  commissionAmount: number | null
  today: string
}) {
  if (input.end > input.today) return

  const settleTo =
    Math.round(
      (Math.max(0, input.baseAmount) +
        (input.commissionAmount == null
          ? 0
          : Math.max(0, Number(input.commissionAmount)))) *
        100,
    ) / 100
  if (settleTo <= 0) return

  const already = await getPaidForContract(
    input.creatorId,
    input.contractId,
    input.start,
    input.end,
  )
  const gap = Math.round((settleTo - already) * 100) / 100
  if (gap <= 0.009) return

  const paidOn = input.end <= input.today ? input.end : input.today
  const note = `Paid for ${input.name} (from contract amounts)`
  await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${input.creatorId}, ${input.contractId}, ${paidOn}, ${gap}, ${note})
  `
  await sql`
    UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${input.creatorId}
  `
}

export async function updateContract(id: number, creatorId: number, formData: FormData) {
  await requireAdmin()
  const name = (formData.get('name') ?? '').toString().trim()
  const start = parseOptionalDate(formData.get('start_date'))
  const end = parseOptionalDate(formData.get('end_date'))
  if (!name || !start) return
  if (end && end < start) return

  const existing = (await sql`
    SELECT base_amount::float AS base_amount,
           commission_amount::float AS commission_amount
    FROM contracts
    WHERE id = ${id} AND creator_id = ${creatorId}
    LIMIT 1
  `) as { base_amount: number; commission_amount: number | null }[]

  const prev = existing[0]
  const q = parseContractQuotas(
    formData,
    prev
      ? {
          baseAmount: Number(prev.base_amount) || 0,
          commissionAmount: prev.commission_amount,
        }
      : undefined,
  )

  await sql`
    UPDATE contracts
    SET name = ${name}, start_date = ${start}, end_date = ${end},
        goal_instagram = ${q.goalInstagram}, goal_tiktok = ${q.goalTiktok},
        target_instagram = ${q.targetInstagram}, target_tiktok = ${q.targetTiktok},
        platforms = ${q.platforms},
        base_amount = ${q.baseAmount}, commission_amount = ${q.commissionAmount}
    WHERE id = ${id} AND creator_id = ${creatorId}
  `

  const today = await getServerToday()
  if (end && end <= today) {
    await syncPaymentFromEndedContractTerms({
      creatorId,
      contractId: id,
      name,
      start,
      end,
      baseAmount: q.baseAmount,
      commissionAmount: q.commissionAmount,
      today,
    })
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

/** One-click: turn every non-current contract’s typed base+commission into real payments. */
export async function recordPastContractsAsPaid(creatorId: number) {
  await requireAdmin()
  const today = await getServerToday()

  const active = (await sql`
    SELECT id FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${today}::date
      AND (end_date IS NULL OR end_date >= ${today}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { id: number }[]
  const activeId = active[0]?.id ?? null

  const rows = (await sql`
    SELECT id, name,
           start_date::text AS start_date,
           end_date::text AS end_date,
           base_amount::float AS base_amount,
           commission_amount::float AS commission_amount
    FROM contracts
    WHERE creator_id = ${creatorId}
    ORDER BY start_date ASC, id ASC
  `) as {
    id: number
    name: string
    start_date: string
    end_date: string | null
    base_amount: number
    commission_amount: number | null
  }[]

  for (const row of rows) {
    if (activeId != null && row.id === activeId) continue
    const end = row.end_date && row.end_date <= today ? row.end_date : today
    // Ensure older open periods get an end date so they stay past.
    if (!row.end_date || row.end_date > today) {
      const prevEnd =
        today <= row.start_date ? row.start_date : addDays(today, -1)
      const closeEnd = row.end_date && row.end_date < today ? row.end_date : prevEnd
      await sql`UPDATE contracts SET end_date = ${closeEnd} WHERE id = ${row.id}`
      await syncPaymentFromEndedContractTerms({
        creatorId,
        contractId: row.id,
        name: row.name,
        start: row.start_date,
        end: closeEnd,
        baseAmount: Number(row.base_amount) || 0,
        commissionAmount: row.commission_amount,
        today,
      })
    } else {
      await syncPaymentFromEndedContractTerms({
        creatorId,
        contractId: row.id,
        name: row.name,
        start: row.start_date,
        end,
        baseAmount: Number(row.base_amount) || 0,
        commissionAmount: row.commission_amount,
        today,
      })
    }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

export async function deleteContract(id: number, creatorId: number) {
  await requireAdmin()
  await sql`DELETE FROM contracts WHERE id = ${id} AND creator_id = ${creatorId}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

// --- Payments ---

export async function recordPayment(creatorId: number, formData: FormData) {
  await requireAdmin()
  const paidOn = parseOptionalDate(formData.get('paid_on'))
  if (!paidOn) return
  const amount = parseAmount(formData.get('amount'))
  if (amount <= 0) return
  const noteRaw = (formData.get('note') ?? '').toString().trim()
  const note = noteRaw ? noteRaw.slice(0, 500) : null
  const contractRaw = (formData.get('contract_id') ?? '').toString()
  let contractId =
    contractRaw && Number.isFinite(Number(contractRaw))
      ? Number(contractRaw)
      : null

  // Prefer an explicit link; otherwise attach to active/open, else latest contract covering paidOn.
  if (contractId == null) {
    const linked = (await sql`
      SELECT id FROM contracts
      WHERE creator_id = ${creatorId}
        AND start_date <= ${paidOn}::date
        AND (end_date IS NULL OR end_date >= ${paidOn}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    if (linked[0]) {
      contractId = linked[0].id
    } else {
      const latest = (await sql`
        SELECT id FROM contracts
        WHERE creator_id = ${creatorId}
        ORDER BY start_date DESC, id DESC
        LIMIT 1
      `) as { id: number }[]
      contractId = latest[0]?.id ?? null
    }
  }

  await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${creatorId}, ${contractId}, ${paidOn}, ${amount}, ${note})
  `
  await sql`UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${creatorId}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

export async function deletePayment(id: number, creatorId: number) {
  await requireAdmin()
  await sql`DELETE FROM payments WHERE id = ${id} AND creator_id = ${creatorId}`
  const latest = (await sql`
    SELECT paid_on::text AS paid_on FROM payments
    WHERE creator_id = ${creatorId}
    ORDER BY paid_on DESC, id DESC LIMIT 1
  `) as { paid_on: string }[]
  await sql`
    UPDATE creators
    SET last_paid_at = ${latest[0]?.paid_on ?? null}
    WHERE id = ${creatorId}
  `
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

/** Record a payment linked to a specific contract (settles that period). */
export async function recordContractPayment(
  creatorId: number,
  contractId: number,
  formData: FormData,
) {
  await requireAdmin()
  const paidOn = parseOptionalDate(formData.get('paid_on')) ?? new Date().toISOString().slice(0, 10)
  const amount = parseAmount(formData.get('amount'))
  if (amount <= 0) return
  const noteRaw = (formData.get('note') ?? '').toString().trim()
  const note = noteRaw ? noteRaw.slice(0, 500) : null

  const owned = (await sql`
    SELECT id FROM contracts
    WHERE id = ${contractId} AND creator_id = ${creatorId}
    LIMIT 1
  `) as { id: number }[]
  if (!owned[0]) return

  await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${creatorId}, ${contractId}, ${paidOn}, ${amount}, ${note})
  `
  await sql`UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${creatorId}`
  revalidatePath('/admin')
  revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

// --- Submissions ---

export async function updateViews(id: number, views: number) {
  await requireAdmin()
  const safe = Number.isFinite(views) && views >= 0 ? Math.floor(views) : 0
  await sql`UPDATE submissions SET views = ${safe} WHERE id = ${id}`
  revalidatePath('/admin')
}

/** Pull DataLikers view counts for every submission (full backfill). */
export async function refreshRecentViews() {
  await requireAdmin()
  if (!process.env.DATALIKERS_API_KEY?.trim()) {
    throw new Error('DATALIKERS_API_KEY is not set')
  }
  const { refreshViews } = await import('@/lib/refresh-views')
  const result = await refreshViews('all')
  revalidatePath('/admin')
  revalidatePath('/submit')
  return result
}

export async function deleteSubmission(id: number) {
  await requireAdmin()
  await sql`DELETE FROM submissions WHERE id = ${id}`
  revalidatePath('/admin')
}
