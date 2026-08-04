import 'server-only'

import { randomBytes } from 'crypto'
import { sql, type Contract } from '@/lib/db'
import { addDays, yearRange } from '@/lib/campaign'
import {
  applyPlatformsToQuotas,
  normalizePlatforms,
  type PlatformsMode,
} from '@/lib/platforms-mode'
import {
  attachTracking,
  getActiveContract,
  getAllPaidTotal,
  getAllProjects,
  getContractComparisons,
  getContractsForCreator,
  getCreatorByName,
  getCreatorPaidTotal,
  getCreatorsWithProgressOnDate,
  getMissesFromProgress,
  getPaidForContract,
  getPaymentDueList,
  getPaymentsForCreator,
  getPaymentsTotalInRange,
  getPaySummary,
  getServerToday,
} from '@/lib/queries'
import { revalidatePath } from 'next/cache'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function revalidateAdmin(creatorId?: number) {
  revalidatePath('/admin')
  if (creatorId != null) revalidatePath(`/admin/creators/${creatorId}`)
  revalidatePath('/submit')
}

// --- Lookups ---

export async function listCreatorsBrief() {
  const rows = (await sql`
    SELECT c.id, c.name, p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    ORDER BY c.name ASC
  `) as { id: number; name: string; project_name: string | null }[]
  return rows
}

export async function listProjectsBrief() {
  const projects = await getAllProjects()
  return projects.map((p) => ({ id: p.id, name: p.name }))
}

export async function resolveCreator(username: string) {
  const cleaned = username.trim().replace(/^@+/, '')
  const creator = await getCreatorByName(cleaned)
  if (!creator) {
    const all = await listCreatorsBrief()
    return {
      ok: false as const,
      error: `No creator named "${cleaned}". Known creators: ${
        all.map((c) => c.name).join(', ') || '(none yet)'
      }`,
    }
  }
  const contracts = await getContractsForCreator(creator.id)
  const today = await getServerToday()
  const active = await getActiveContract(creator.id, today)
  return {
    ok: true as const,
    creator: { id: creator.id, name: creator.name },
    contractCount: contracts.length,
    activeContract: active
      ? {
          id: active.id,
          name: active.name,
          start_date: active.start_date,
          end_date: active.end_date,
          base_amount: active.base_amount,
          target_tiktok: active.target_tiktok,
          target_instagram: active.target_instagram,
        }
      : null,
  }
}

export async function listContractsForCreator(username: string) {
  const cleaned = username.trim().replace(/^@+/, '')
  const creator = await getCreatorByName(cleaned)
  if (!creator) {
    const all = await listCreatorsBrief()
    return {
      ok: false as const,
      error: `No creator named "${cleaned}". Known creators: ${
        all.map((c) => c.name).join(', ') || '(none yet)'
      }`,
    }
  }
  const today = await getServerToday()
  const comparisons = await getContractComparisons(creator, today)
  return {
    ok: true as const,
    creator: { id: creator.id, name: creator.name },
    today,
    contracts: comparisons.map((row) => ({
      id: row.contract.id,
      name: row.contract.name,
      start_date: row.contract.start_date,
      end_date: row.contract.end_date,
      isActive: row.isActive,
      isPast: row.isPast,
      platforms: row.contract.platforms,
      base_amount: Number(row.contract.base_amount) || 0,
      commission_amount: row.contract.commission_amount,
      commissionMissing: row.commissionMissing,
      paid: row.paidAmount,
      balance: row.balance,
      target_instagram: row.contract.target_instagram,
      target_tiktok: row.contract.target_tiktok,
      videoCount: row.videoCount,
    })),
  }
}

export async function listPaymentsForCreator(username: string) {
  const resolved = await resolveCreator(username)
  if (!resolved.ok) return resolved
  const payments = await getPaymentsForCreator(resolved.creator.id)
  return {
    ok: true as const,
    creator: resolved.creator,
    payments: payments.map((p) => ({
      id: p.id,
      paid_on: p.paid_on,
      amount: p.amount,
      note: p.note,
      contract_id: p.contract_id,
      contract_name: p.contract_name ?? null,
    })),
  }
}

export async function getCreatorSnapshot(username: string) {
  const cleaned = username.trim().replace(/^@+/, '')
  const creator = await getCreatorByName(cleaned)
  if (!creator) {
    const all = await listCreatorsBrief()
    return {
      ok: false as const,
      error: `No creator named "${cleaned}". Known creators: ${
        all.map((c) => c.name).join(', ') || '(none yet)'
      }`,
    }
  }
  const today = await getServerToday()
  const [comparisons, payments, paidTotal, pay] = await Promise.all([
    getContractComparisons(creator, today),
    getPaymentsForCreator(creator.id),
    getCreatorPaidTotal(creator.id),
    getPaySummary(creator, today),
  ])
  const active = comparisons.find((c) => c.isActive) ?? null

  return {
    ok: true as const,
    today,
    creator: {
      id: creator.id,
      name: creator.name,
      project_id: creator.project_id,
      platforms: creator.platforms,
      goal_instagram: creator.goal_instagram,
      goal_tiktok: creator.goal_tiktok,
      notes: creator.notes,
    },
    activeContract: active
      ? {
          id: active.contract.id,
          name: active.contract.name,
          start_date: active.contract.start_date,
          end_date: active.contract.end_date,
          base_amount: Number(active.contract.base_amount) || 0,
          commission_amount: active.contract.commission_amount,
          paid: active.paidAmount,
          balance: active.balance,
        }
      : null,
    contracts: comparisons.map((row) => ({
      id: row.contract.id,
      name: row.contract.name,
      start_date: row.contract.start_date,
      end_date: row.contract.end_date,
      isActive: row.isActive,
      isPast: row.isPast,
      base_amount: Number(row.contract.base_amount) || 0,
      commission_amount: row.contract.commission_amount,
      paid: row.paidAmount,
      balance: row.balance,
    })),
    paidTotal,
    lastPayment: payments[0]
      ? { id: payments[0].id, paid_on: payments[0].paid_on, amount: payments[0].amount }
      : null,
    pay: {
      lastPaidAt: pay.lastPaidAt,
      nextPayAt: pay.nextPayAt,
      payEveryDays: pay.payEveryDays,
      isDue: pay.isDue,
      overdueDays: pay.overdueDays,
    },
  }
}

export async function getPayDueSnapshot(projectId?: number) {
  const today = await getServerToday()
  const { due, settled } = await getPaymentDueList(today, projectId)
  return { ok: true as const, today, due, settled }
}

export async function getMissesSnapshot(day?: string) {
  const today = await getServerToday()
  const targetDay = isDateString(day) ? day : today
  const creatorsBase = await getCreatorsWithProgressOnDate(targetDay)
  const creators = await attachTracking(creatorsBase, today)
  const misses = getMissesFromProgress(creators)
  return { ok: true as const, day: targetDay, misses }
}

export async function getPaidTotalsSnapshot(input: {
  projectId?: number
  from?: string
  to?: string
  creatorUsername?: string
}) {
  const today = await getServerToday()
  const { start: yearStart } = yearRange(today)
  const from = isDateString(input.from) ? input.from : yearStart
  const to = isDateString(input.to) ? input.to : today

  let creatorId: number | undefined
  if (input.creatorUsername) {
    const resolved = await resolveCreator(input.creatorUsername)
    if (!resolved.ok) return resolved
    creatorId = resolved.creator.id
  }

  const [rangeTotal, allTimeTotal] = await Promise.all([
    getPaymentsTotalInRange(from, to, creatorId),
    creatorId != null ? getCreatorPaidTotal(creatorId) : getAllPaidTotal(input.projectId),
  ])

  return {
    ok: true as const,
    from,
    to,
    creator: input.creatorUsername?.replace(/^@+/, '') ?? null,
    projectId: input.projectId ?? null,
    rangeTotal,
    allTimeTotal,
  }
}

export async function getViewsSummarySnapshot(input: {
  from?: string
  to?: string
  creatorUsername?: string
  projectId?: number
}) {
  const { getViewsSummary } = await import('@/lib/analytics')
  let creatorId: number | null = null
  if (input.creatorUsername) {
    const resolved = await resolveCreator(input.creatorUsername)
    if (!resolved.ok) return resolved
    creatorId = resolved.creator.id
  }
  const summary = await getViewsSummary({
    from: input.from,
    to: input.to,
    creatorId,
    projectId: input.projectId ?? null,
  })
  return {
    ok: true as const,
    ...summary,
    creator: input.creatorUsername?.replace(/^@+/, '') ?? null,
    advice:
      summary.videos === 0
        ? 'No videos in this range.'
        : summary.zero_view_videos > summary.videos * 0.3
          ? `Many videos still show 0 views (${summary.zero_view_videos}/${summary.videos}). Run Retry 0-view videos in Analytics/Videos, then revisit totals.`
          : summary.views_tiktok >= summary.views_instagram * 2
            ? 'TikTok is carrying most of the views in this period.'
            : summary.views_instagram >= summary.views_tiktok * 2
              ? 'Instagram is carrying most of the views in this period.'
              : 'Instagram and TikTok views are relatively balanced in this period.',
  }
}

export async function getViewsLeaderboardSnapshot(input: {
  from?: string
  to?: string
  projectId?: number
  limit?: number
}) {
  const { getViewsLeaderboard, getViewsSummary } = await import('@/lib/analytics')
  const [rows, summary] = await Promise.all([
    getViewsLeaderboard({
      from: input.from,
      to: input.to,
      projectId: input.projectId ?? null,
      limit: input.limit ?? 10,
    }),
    getViewsSummary({
      from: input.from,
      to: input.to,
      projectId: input.projectId ?? null,
    }),
  ])
  const top = rows[0] ?? null
  return {
    ok: true as const,
    from: summary.from,
    to: summary.to,
    totalViews: summary.views,
    leaders: rows,
    topCreator: top
      ? {
          name: top.creator_name,
          views: top.views,
          videos: top.videos,
          avgViewsPerVideo:
            top.videos > 0 ? Math.round(top.views / top.videos) : 0,
        }
      : null,
    advice: top
      ? `${top.creator_name} leads with ${top.views} views across ${top.videos} videos (${summary.from} → ${summary.to}).`
      : 'No submissions in this period.',
  }
}

export async function getViewsByDaySnapshot(input: {
  from?: string
  to?: string
  creatorUsername?: string
  projectId?: number
}) {
  const { getDailyAnalytics, getViewsSummary } = await import('@/lib/analytics')
  let creatorId: number | null = null
  if (input.creatorUsername) {
    const resolved = await resolveCreator(input.creatorUsername)
    if (!resolved.ok) return resolved
    creatorId = resolved.creator.id
  }
  const [daily, summary] = await Promise.all([
    getDailyAnalytics({
      from: input.from,
      to: input.to,
      creatorId,
      projectId: input.projectId ?? null,
    }),
    getViewsSummary({
      from: input.from,
      to: input.to,
      creatorId,
      projectId: input.projectId ?? null,
    }),
  ])
  const peak = daily.reduce<{
    date: string
    views: number
  } | null>((best, d) => {
    const views = d.views_instagram + d.views_tiktok
    if (!best || views > best.views) return { date: d.date, views }
    return best
  }, null)

  return {
    ok: true as const,
    summary,
    creator: input.creatorUsername?.replace(/^@+/, '') ?? null,
    days: daily.map((d) => ({
      date: d.date,
      views: d.views_instagram + d.views_tiktok,
      videos: d.videos_instagram + d.videos_tiktok,
      views_instagram: d.views_instagram,
      views_tiktok: d.views_tiktok,
      videos_instagram: d.videos_instagram,
      videos_tiktok: d.videos_tiktok,
    })),
    peakDay: peak,
  }
}

// --- Contract lookup helper (shared by update / record-payment / end) ---

export type ContractWhich = 'active' | 'past' | 'oldestPast'

async function findContractForAssistant(
  creatorId: number,
  today: string,
  opts: { contractId?: number | null; contractName?: string | null; which?: ContractWhich },
): Promise<{ ok: true; contract: Contract } | { ok: false; error: string }> {
  const contracts = await getContractsForCreator(creatorId)
  if (contracts.length === 0) {
    return { ok: false, error: 'This creator has no contracts yet. Use createContract first.' }
  }

  if (opts.contractId != null && Number.isFinite(opts.contractId)) {
    const found = contracts.find((c) => c.id === opts.contractId)
    if (!found) {
      return { ok: false, error: `No contract with id ${opts.contractId} for this creator.` }
    }
    return { ok: true, contract: found }
  }

  if (opts.contractName && opts.contractName.trim()) {
    const needle = opts.contractName.trim().toLowerCase()
    const exact = contracts.find((c) => c.name.toLowerCase() === needle)
    if (exact) return { ok: true, contract: exact }
    const partial = contracts.filter((c) => c.name.toLowerCase().includes(needle))
    if (partial.length === 1) return { ok: true, contract: partial[0] }
    if (partial.length > 1) {
      return {
        ok: false,
        error: `Multiple contracts match "${opts.contractName}": ${partial
          .map((c) => `${c.name} (id ${c.id})`)
          .join(', ')}. Specify contractId.`,
      }
    }
    return {
      ok: false,
      error: `No contract named "${opts.contractName}" found. Options: ${contracts
        .map((c) => c.name)
        .join(', ')}`,
    }
  }

  if (opts.which === 'active') {
    const active = await getActiveContract(creatorId, today)
    if (!active) return { ok: false, error: 'No active contract found for this creator.' }
    return { ok: true, contract: active }
  }

  const pastAscending = contracts
    .filter((c) => c.end_date != null && c.end_date <= today)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))

  if (opts.which === 'oldestPast') {
    if (pastAscending.length === 0) {
      return { ok: false, error: 'No past (ended) contracts found for this creator.' }
    }
    return { ok: true, contract: pastAscending[0] }
  }

  if (opts.which === 'past') {
    if (pastAscending.length === 0) {
      return { ok: false, error: 'No past (ended) contracts found for this creator.' }
    }
    return { ok: true, contract: pastAscending[pastAscending.length - 1] }
  }

  if (contracts.length === 1) return { ok: true, contract: contracts[0] }

  return {
    ok: false,
    error: `This creator has ${contracts.length} contracts — specify contractId, contractName, or which ("active"/"past"/"oldestPast"). Options: ${contracts
      .map((c) => `${c.name} (id ${c.id}${c.end_date ? `, ended ${c.end_date}` : ', open'})`)
      .join('; ')}`,
  }
}

/**
 * On ended contracts, money typed on the contract (base + commission) is what was already paid.
 * Insert/top-up a payment so Total paid and Pay due stay in sync — mirrors the admin save path.
 */
async function syncPaymentGap(input: {
  creatorId: number
  contractId: number
  name: string
  start: string
  end: string
  baseAmount: number
  commissionAmount: number | null
  today: string
}): Promise<{ paymentId: number; amount: number } | null> {
  if (input.end > input.today) return null

  const settleTo = roundMoney(
    Math.max(0, input.baseAmount) +
      (input.commissionAmount == null ? 0 : Math.max(0, Number(input.commissionAmount))),
  )
  if (settleTo <= 0) return null

  const already = await getPaidForContract(input.creatorId, input.contractId, input.start, input.end)
  const gap = roundMoney(settleTo - already)
  if (gap <= 0.009) return null

  const paidOn = input.end <= input.today ? input.end : input.today
  const note = `Paid for ${input.name} (from contract amounts)`
  const inserted = (await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${input.creatorId}, ${input.contractId}, ${paidOn}, ${gap}, ${note})
    RETURNING id
  `) as { id: number }[]
  await sql`UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${input.creatorId}`
  const paymentId = inserted[0]?.id
  if (paymentId == null) return null
  return { paymentId, amount: gap }
}

// --- Contracts: create ---

export type CreateContractInput = {
  creatorUsername: string
  /** Display name for the contract period, e.g. "August round" */
  contractName?: string
  startDate?: string
  /** Inclusive end date YYYY-MM-DD. Omit for open-ended. */
  endDate?: string | null
  /** If set and endDate omitted, endDate = start + durationDays - 1 */
  durationDays?: number | null
  targetInstagram?: number
  targetTiktok?: number
  goalInstagram?: number
  goalTiktok?: number
  platforms?: PlatformsMode | string
  baseAmount?: number
  commissionAmount?: number | null
  /** When true (default), closes any overlapping contract and starts a new one */
  replaceOpen?: boolean
}

export type ClosedContractRef = { id: number; previousEndDate: string | null }

export async function createContractFromAssistant(input: CreateContractInput) {
  const resolved = await resolveCreator(input.creatorUsername.replace(/^@+/, ''))
  if (!resolved.ok) return resolved

  const today = await getServerToday()
  const start = isDateString(input.startDate) ? input.startDate : today

  let end: string | null = isDateString(input.endDate) ? input.endDate : null

  if (!end && input.durationDays != null && input.durationDays > 0) {
    end = addDays(start, Math.floor(input.durationDays) - 1)
  }

  if (end && end < start) {
    return { ok: false as const, error: 'endDate must be on or after startDate.' }
  }

  let platforms = normalizePlatforms(input.platforms)
  // Infer TikTok/IG-only when only one side has quotas.
  if (platforms === 'both') {
    const hasIg = (input.targetInstagram ?? 0) > 0 || (input.goalInstagram ?? 0) > 0
    const hasTt = (input.targetTiktok ?? 0) > 0 || (input.goalTiktok ?? 0) > 0
    if (hasTt && !hasIg) platforms = 'tiktok'
    if (hasIg && !hasTt) platforms = 'instagram'
  }

  const rawTargetIg = Math.max(0, Math.floor(input.targetInstagram ?? 0))
  const rawTargetTt = Math.max(0, Math.floor(input.targetTiktok ?? 0))
  const spanDays = end ? daysBetweenInclusive(start, end) : 30

  const rawGoalIg =
    input.goalInstagram != null
      ? Math.max(0, Math.floor(input.goalInstagram))
      : rawTargetIg > 0
        ? Math.max(1, Math.ceil(rawTargetIg / spanDays))
        : 0
  const rawGoalTt =
    input.goalTiktok != null
      ? Math.max(0, Math.floor(input.goalTiktok))
      : rawTargetTt > 0
        ? Math.max(1, Math.ceil(rawTargetTt / spanDays))
        : 0

  const quotas = applyPlatformsToQuotas(platforms, {
    goalInstagram: rawGoalIg,
    goalTiktok: rawGoalTt,
    targetInstagram: rawTargetIg,
    targetTiktok: rawTargetTt,
  })
  const {
    goalInstagram: goalIg,
    goalTiktok: goalTt,
    targetInstagram: targetIg,
    targetTiktok: targetTt,
  } = quotas

  const baseAmount = roundMoney(Math.max(0, input.baseAmount ?? 0))
  const commissionAmount =
    input.commissionAmount == null ? null : roundMoney(Math.max(0, input.commissionAmount))

  const name = (input.contractName ?? '').trim() || `${resolved.creator.name} · ${start}`

  const creatorId = resolved.creator.id
  const replaceOpen = input.replaceOpen !== false

  // Close ALL contracts that overlap the new start date, matching admin's startNewContract
  // (not just the one with a NULL end_date).
  const closedContracts: ClosedContractRef[] = []
  if (replaceOpen) {
    const covering = (await sql`
      SELECT id, start_date::text AS start_date, end_date::text AS end_date
      FROM contracts
      WHERE creator_id = ${creatorId}
        AND start_date <= ${start}::date
        AND (end_date IS NULL OR end_date >= ${start}::date)
      ORDER BY start_date DESC, id DESC
    `) as { id: number; start_date: string; end_date: string | null }[]

    for (const row of covering) {
      const prevEnd = start <= row.start_date ? row.start_date : addDays(start, -1)
      await sql`UPDATE contracts SET end_date = ${prevEnd} WHERE id = ${row.id}`
      closedContracts.push({ id: row.id, previousEndDate: row.end_date })
    }
  }

  const inserted = (await sql`
    INSERT INTO contracts (
      creator_id, name, start_date, end_date,
      goal_instagram, goal_tiktok, target_instagram, target_tiktok,
      platforms, base_amount, commission_amount
    )
    VALUES (
      ${creatorId}, ${name}, ${start}, ${end},
      ${goalIg}, ${goalTt}, ${targetIg}, ${targetTt},
      ${platforms}, ${baseAmount}, ${commissionAmount}
    )
    RETURNING id
  `) as { id: number }[]

  revalidateAdmin(creatorId)

  return {
    ok: true as const,
    action:
      closedContracts.length > 0 ? ('started_new_contract' as const) : ('created_contract' as const),
    contractId: inserted[0]?.id,
    creatorId,
    creator: resolved.creator.name,
    name,
    start_date: start,
    end_date: end,
    platforms,
    goal_instagram: goalIg,
    goal_tiktok: goalTt,
    target_instagram: targetIg,
    target_tiktok: targetTt,
    base_amount: baseAmount,
    commission_amount: commissionAmount,
    closedContracts,
  }
}

export async function undoContractCreate(input: {
  contractId: number
  creatorId: number
  closedContracts?: ClosedContractRef[] | null
}) {
  const { contractId, creatorId, closedContracts } = input
  await sql`DELETE FROM contracts WHERE id = ${contractId} AND creator_id = ${creatorId}`
  for (const c of closedContracts ?? []) {
    await sql`UPDATE contracts SET end_date = ${c.previousEndDate} WHERE id = ${c.id} AND creator_id = ${creatorId}`
  }
  revalidateAdmin(creatorId)
  return { ok: true as const }
}

// --- Contracts: update / end ---

export type UpdateContractInput = {
  creatorUsername: string
  contractId?: number
  contractName?: string
  which?: ContractWhich
  /** New display name; leave unset to keep the existing name */
  name?: string
  startDate?: string
  endDate?: string | null
  durationDays?: number | null
  targetInstagram?: number
  targetTiktok?: number
  goalInstagram?: number
  goalTiktok?: number
  platforms?: PlatformsMode | string
  baseAmount?: number
  commissionAmount?: number | null
  /** Force syncing paid amounts even if the contract isn't ended yet */
  recordAsPaid?: boolean
}

export type ContractSnapshot = {
  name: string
  start_date: string
  end_date: string | null
  platforms: string
  goal_instagram: number
  goal_tiktok: number
  target_instagram: number
  target_tiktok: number
  base_amount: number
  commission_amount: number | null
}

function snapshotContract(c: Contract): ContractSnapshot {
  return {
    name: c.name,
    start_date: c.start_date,
    end_date: c.end_date,
    platforms: c.platforms,
    goal_instagram: c.goal_instagram,
    goal_tiktok: c.goal_tiktok,
    target_instagram: c.target_instagram,
    target_tiktok: c.target_tiktok,
    base_amount: Number(c.base_amount) || 0,
    commission_amount: c.commission_amount,
  }
}

export async function updateContractFromAssistant(input: UpdateContractInput) {
  const resolved = await resolveCreator(input.creatorUsername.replace(/^@+/, ''))
  if (!resolved.ok) return resolved
  const creatorId = resolved.creator.id
  const today = await getServerToday()

  const found = await findContractForAssistant(creatorId, today, {
    contractId: input.contractId,
    contractName: input.contractName,
    which: input.which,
  })
  if (!found.ok) return found

  const existing = found.contract
  const previous = snapshotContract(existing)

  const name = (input.name ?? '').trim() || existing.name
  const start = isDateString(input.startDate) ? input.startDate : existing.start_date

  let end: string | null =
    input.endDate === null
      ? null
      : isDateString(input.endDate)
        ? input.endDate
        : existing.end_date

  if (input.endDate === undefined && input.durationDays != null && input.durationDays > 0) {
    end = addDays(start, Math.floor(input.durationDays) - 1)
  }

  if (end && end < start) {
    return { ok: false as const, error: 'endDate must be on or after startDate.' }
  }

  const platforms =
    input.platforms != null ? normalizePlatforms(input.platforms) : normalizePlatforms(existing.platforms)

  const rawTargetIg =
    input.targetInstagram != null
      ? Math.max(0, Math.floor(input.targetInstagram))
      : existing.target_instagram
  const rawTargetTt =
    input.targetTiktok != null ? Math.max(0, Math.floor(input.targetTiktok)) : existing.target_tiktok
  const rawGoalIg =
    input.goalInstagram != null ? Math.max(0, Math.floor(input.goalInstagram)) : existing.goal_instagram
  const rawGoalTt =
    input.goalTiktok != null ? Math.max(0, Math.floor(input.goalTiktok)) : existing.goal_tiktok

  const quotas = applyPlatformsToQuotas(platforms, {
    goalInstagram: rawGoalIg,
    goalTiktok: rawGoalTt,
    targetInstagram: rawTargetIg,
    targetTiktok: rawTargetTt,
  })

  const baseAmount =
    input.baseAmount != null ? roundMoney(Math.max(0, input.baseAmount)) : Number(existing.base_amount) || 0
  const commissionAmount =
    input.commissionAmount === null
      ? null
      : input.commissionAmount != null
        ? roundMoney(Math.max(0, input.commissionAmount))
        : existing.commission_amount

  await sql`
    UPDATE contracts
    SET name = ${name}, start_date = ${start}, end_date = ${end},
        goal_instagram = ${quotas.goalInstagram}, goal_tiktok = ${quotas.goalTiktok},
        target_instagram = ${quotas.targetInstagram}, target_tiktok = ${quotas.targetTiktok},
        platforms = ${platforms},
        base_amount = ${baseAmount}, commission_amount = ${commissionAmount}
    WHERE id = ${existing.id} AND creator_id = ${creatorId}
  `

  let paymentId: number | null = null
  const isEnded = end != null && end <= today
  if (isEnded || input.recordAsPaid === true) {
    const effectiveEnd = end ?? today
    const synced = await syncPaymentGap({
      creatorId,
      contractId: existing.id,
      name,
      start,
      end: effectiveEnd,
      baseAmount,
      commissionAmount,
      today,
    })
    paymentId = synced?.paymentId ?? null
  }

  revalidateAdmin(creatorId)

  return {
    ok: true as const,
    contractId: existing.id,
    creatorId,
    creator: resolved.creator.name,
    name,
    start_date: start,
    end_date: end,
    platforms,
    goal_instagram: quotas.goalInstagram,
    goal_tiktok: quotas.goalTiktok,
    target_instagram: quotas.targetInstagram,
    target_tiktok: quotas.targetTiktok,
    base_amount: baseAmount,
    commission_amount: commissionAmount,
    paymentId,
    previous,
  }
}

export async function undoContractUpdate(input: {
  contractId: number
  creatorId: number
  previous: ContractSnapshot
  paymentId?: number | null
}) {
  const { contractId, creatorId, previous, paymentId } = input
  await sql`
    UPDATE contracts
    SET name = ${previous.name}, start_date = ${previous.start_date}, end_date = ${previous.end_date},
        platforms = ${previous.platforms},
        goal_instagram = ${previous.goal_instagram}, goal_tiktok = ${previous.goal_tiktok},
        target_instagram = ${previous.target_instagram}, target_tiktok = ${previous.target_tiktok},
        base_amount = ${previous.base_amount}, commission_amount = ${previous.commission_amount}
    WHERE id = ${contractId} AND creator_id = ${creatorId}
  `
  if (paymentId != null) {
    await sql`DELETE FROM payments WHERE id = ${paymentId} AND creator_id = ${creatorId}`
    const latest = (await sql`
      SELECT paid_on::text AS paid_on FROM payments
      WHERE creator_id = ${creatorId}
      ORDER BY paid_on DESC, id DESC LIMIT 1
    `) as { paid_on: string }[]
    await sql`UPDATE creators SET last_paid_at = ${latest[0]?.paid_on ?? null} WHERE id = ${creatorId}`
  }
  revalidateAdmin(creatorId)
  return { ok: true as const }
}

export type EndContractInput = {
  creatorUsername: string
  contractId?: number
  contractName?: string
  which?: ContractWhich
  endDate?: string | null
  baseAmount?: number
  commissionAmount?: number | null
}

/** Ends a contract today (or on endDate) and records its terms as paid — a thin wrapper over update. */
export async function endContractFromAssistant(input: EndContractInput) {
  const today = await getServerToday()
  const endDate = isDateString(input.endDate) ? input.endDate : today
  return updateContractFromAssistant({
    creatorUsername: input.creatorUsername,
    contractId: input.contractId,
    contractName: input.contractName,
    which: input.which ?? 'active',
    endDate,
    baseAmount: input.baseAmount,
    commissionAmount: input.commissionAmount,
    recordAsPaid: true,
  })
}

// --- Contracts: record past periods as paid (bulk) ---

export async function recordPastAsPaidFromAssistant(username: string) {
  const resolved = await resolveCreator(username.replace(/^@+/, ''))
  if (!resolved.ok) return resolved
  const creatorId = resolved.creator.id
  const today = await getServerToday()

  const activeRows = (await sql`
    SELECT id FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${today}::date
      AND (end_date IS NULL OR end_date >= ${today}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { id: number }[]
  const activeId = activeRows[0]?.id ?? null

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

  const paymentIds: number[] = []
  let recordedAmount = 0

  for (const row of rows) {
    if (activeId != null && row.id === activeId) continue

    let end = row.end_date && row.end_date <= today ? row.end_date : today
    if (!row.end_date || row.end_date > today) {
      const prevEnd = today <= row.start_date ? row.start_date : addDays(today, -1)
      const closeEnd = row.end_date && row.end_date < today ? row.end_date : prevEnd
      await sql`UPDATE contracts SET end_date = ${closeEnd} WHERE id = ${row.id}`
      end = closeEnd
    }

    const synced = await syncPaymentGap({
      creatorId,
      contractId: row.id,
      name: row.name,
      start: row.start_date,
      end,
      baseAmount: Number(row.base_amount) || 0,
      commissionAmount: row.commission_amount,
      today,
    })
    if (synced) {
      paymentIds.push(synced.paymentId)
      recordedAmount = roundMoney(recordedAmount + synced.amount)
    }
  }

  revalidateAdmin(creatorId)

  return {
    ok: true as const,
    creatorId,
    creator: resolved.creator.name,
    paymentIds,
    recordedAmount,
  }
}

export async function undoPastAsPaid(input: { creatorId: number; paymentIds: number[] }) {
  const { creatorId, paymentIds } = input
  for (const id of paymentIds) {
    await sql`DELETE FROM payments WHERE id = ${id} AND creator_id = ${creatorId}`
  }
  const latest = (await sql`
    SELECT paid_on::text AS paid_on FROM payments
    WHERE creator_id = ${creatorId}
    ORDER BY paid_on DESC, id DESC LIMIT 1
  `) as { paid_on: string }[]
  await sql`UPDATE creators SET last_paid_at = ${latest[0]?.paid_on ?? null} WHERE id = ${creatorId}`
  revalidateAdmin(creatorId)
  return { ok: true as const }
}

// --- Payments ---

export type RecordPaymentInput = {
  creatorUsername: string
  amount: number
  paidOn?: string
  note?: string | null
  /** Link to active contract when true (default) */
  linkActiveContract?: boolean
  contractId?: number | null
  /** Find the contract by (partial) name instead of id */
  contractName?: string
  /** Attach to the most recently ended contract instead of the active one */
  preferPastContract?: boolean
}

export async function recordPaymentFromAssistant(input: RecordPaymentInput) {
  const resolved = await resolveCreator(input.creatorUsername.replace(/^@+/, ''))
  if (!resolved.ok) return resolved

  const today = await getServerToday()
  const paidOn = isDateString(input.paidOn) ? input.paidOn : today
  const amount = roundMoney(Math.max(0, input.amount))
  if (amount <= 0) {
    return { ok: false as const, error: 'Payment amount must be greater than 0.' }
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null
  const creatorId = resolved.creator.id

  let contractId: number | null =
    input.contractId != null && Number.isFinite(input.contractId) ? Number(input.contractId) : null

  if (contractId == null && input.contractName) {
    const found = await findContractForAssistant(creatorId, today, { contractName: input.contractName })
    if (!found.ok) return found
    contractId = found.contract.id
  }

  if (contractId == null && input.preferPastContract) {
    const contracts = await getContractsForCreator(creatorId)
    const pastDescending = contracts
      .filter((c) => c.end_date != null && c.end_date <= today)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0))
    if (pastDescending[0]) contractId = pastDescending[0].id
  }

  if (contractId == null && input.linkActiveContract !== false) {
    contractId = resolved.activeContract?.id ?? null
  }
  if (contractId == null) {
    const covering = (await sql`
      SELECT id FROM contracts
      WHERE creator_id = ${creatorId}
        AND start_date <= ${paidOn}::date
        AND (end_date IS NULL OR end_date >= ${paidOn}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    contractId = covering[0]?.id ?? null
  }
  if (contractId == null) {
    const latest = (await sql`
      SELECT id FROM contracts
      WHERE creator_id = ${creatorId}
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `) as { id: number }[]
    contractId = latest[0]?.id ?? null
  }

  const inserted = (await sql`
    INSERT INTO payments (creator_id, contract_id, paid_on, amount, note)
    VALUES (${creatorId}, ${contractId}, ${paidOn}, ${amount}, ${note})
    RETURNING id
  `) as { id: number }[]

  await sql`UPDATE creators SET last_paid_at = ${paidOn} WHERE id = ${creatorId}`

  revalidateAdmin(creatorId)

  return {
    ok: true as const,
    paymentId: inserted[0]?.id,
    creatorId,
    creator: resolved.creator.name,
    amount,
    paid_on: paidOn,
    contract_id: contractId,
    note,
  }
}

export async function undoPaymentCreate(input: { paymentId: number; creatorId: number }) {
  const { paymentId, creatorId } = input
  await sql`DELETE FROM payments WHERE id = ${paymentId} AND creator_id = ${creatorId}`
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
  revalidateAdmin(creatorId)
  return { ok: true as const }
}

// --- Creators ---

export type CreateCreatorInput = {
  username: string
  projectId?: number | null
  platforms?: PlatformsMode | string
  goalInstagram?: number
  goalTiktok?: number
  payEveryDays?: number
  notes?: string | null
  lastPaidAt?: string | null
  contractName?: string
  contractStart?: string | null
}

export type CreatorSnapshot = {
  name: string
  project_id: number | null
  platforms: string
  goal_instagram: number
  goal_tiktok: number
  pay_every_days: number
  notes: string | null
  last_paid_at: string | null
}

export async function createCreatorFromAssistant(input: CreateCreatorInput) {
  const name = input.username.trim().replace(/^@+/, '')
  if (!name) return { ok: false as const, error: 'Username is required.' }

  const existing = await getCreatorByName(name)
  if (existing) {
    return {
      ok: false as const,
      error: `A creator named "${name}" already exists (id ${existing.id}). Use updateCreator instead.`,
    }
  }

  const platforms = normalizePlatforms(input.platforms)
  const goals = applyPlatformsToQuotas(platforms, {
    goalInstagram: Math.max(0, Math.floor(input.goalInstagram ?? 0)),
    goalTiktok: Math.max(0, Math.floor(input.goalTiktok ?? 0)),
    targetInstagram: 0,
    targetTiktok: 0,
  })
  const lastPaidAt = isDateString(input.lastPaidAt) ? input.lastPaidAt : null
  const payEveryDays =
    input.payEveryDays != null && input.payEveryDays >= 1 ? Math.min(365, Math.floor(input.payEveryDays)) : 14
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null
  const projectId = input.projectId ?? null
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
  if (creatorId == null) return { ok: false as const, error: 'Failed to create creator.' }

  let contractId: number | null = null
  const contractStart = isDateString(input.contractStart) ? input.contractStart : null
  if (contractStart) {
    const contractName = (input.contractName ?? '').trim() || 'Initial contract'
    const inserted = (await sql`
      INSERT INTO contracts (
        creator_id, name, start_date, end_date,
        goal_instagram, goal_tiktok, platforms
      )
      VALUES (
        ${creatorId}, ${contractName}, ${contractStart}, NULL,
        ${goals.goalInstagram}, ${goals.goalTiktok}, ${platforms}
      )
      RETURNING id
    `) as { id: number }[]
    contractId = inserted[0]?.id ?? null
  }

  revalidateAdmin()

  return {
    ok: true as const,
    creatorId,
    name,
    projectId,
    platforms,
    goal_instagram: goals.goalInstagram,
    goal_tiktok: goals.goalTiktok,
    contractId,
  }
}

export async function undoCreatorCreate(input: { creatorId: number }) {
  await sql`DELETE FROM payments WHERE creator_id = ${input.creatorId}`
  await sql`DELETE FROM contracts WHERE creator_id = ${input.creatorId}`
  await sql`DELETE FROM submissions WHERE creator_id = ${input.creatorId}`
  await sql`DELETE FROM creators WHERE id = ${input.creatorId}`
  revalidateAdmin()
  return { ok: true as const }
}

export type UpdateCreatorInput = {
  username: string
  newUsername?: string
  projectId?: number | null
  platforms?: PlatformsMode | string
  goalInstagram?: number
  goalTiktok?: number
  payEveryDays?: number
  notes?: string | null
  lastPaidAt?: string | null
}

export async function updateCreatorFromAssistant(input: UpdateCreatorInput) {
  const cleaned = input.username.trim().replace(/^@+/, '')
  const creator = await getCreatorByName(cleaned)
  if (!creator) {
    const all = await listCreatorsBrief()
    return {
      ok: false as const,
      error: `No creator named "${cleaned}". Known creators: ${
        all.map((c) => c.name).join(', ') || '(none yet)'
      }`,
    }
  }

  const previous: CreatorSnapshot = {
    name: creator.name,
    project_id: creator.project_id,
    platforms: creator.platforms,
    goal_instagram: creator.goal_instagram,
    goal_tiktok: creator.goal_tiktok,
    pay_every_days: creator.pay_every_days,
    notes: creator.notes,
    last_paid_at: creator.last_paid_at,
  }

  const name = (input.newUsername ?? '').trim() || creator.name
  const projectId = input.projectId !== undefined ? input.projectId : creator.project_id
  const platforms =
    input.platforms != null ? normalizePlatforms(input.platforms) : normalizePlatforms(creator.platforms)
  const goalIg =
    input.goalInstagram != null ? Math.max(0, Math.floor(input.goalInstagram)) : creator.goal_instagram
  const goalTt =
    input.goalTiktok != null ? Math.max(0, Math.floor(input.goalTiktok)) : creator.goal_tiktok
  const goals = applyPlatformsToQuotas(platforms, {
    goalInstagram: goalIg,
    goalTiktok: goalTt,
    targetInstagram: 0,
    targetTiktok: 0,
  })
  const payEveryDays =
    input.payEveryDays != null && input.payEveryDays >= 1
      ? Math.min(365, Math.floor(input.payEveryDays))
      : creator.pay_every_days
  const notes =
    input.notes === null
      ? null
      : input.notes !== undefined
        ? input.notes.trim().slice(0, 2000) || null
        : creator.notes
  const lastPaidAt =
    input.lastPaidAt === null
      ? null
      : isDateString(input.lastPaidAt)
        ? input.lastPaidAt
        : creator.last_paid_at

  await sql`
    UPDATE creators
    SET name = ${name}, project_id = ${projectId},
        goal_instagram = ${goals.goalInstagram}, goal_tiktok = ${goals.goalTiktok},
        platforms = ${platforms},
        last_paid_at = ${lastPaidAt}, pay_every_days = ${payEveryDays},
        notes = ${notes}
    WHERE id = ${creator.id}
  `

  revalidateAdmin(creator.id)

  return {
    ok: true as const,
    creatorId: creator.id,
    name,
    projectId,
    platforms,
    goal_instagram: goals.goalInstagram,
    goal_tiktok: goals.goalTiktok,
    pay_every_days: payEveryDays,
    notes,
    last_paid_at: lastPaidAt,
    previous,
  }
}

export async function undoCreatorUpdate(input: { creatorId: number; previous: CreatorSnapshot }) {
  const { creatorId, previous } = input
  await sql`
    UPDATE creators
    SET name = ${previous.name}, project_id = ${previous.project_id},
        platforms = ${previous.platforms},
        goal_instagram = ${previous.goal_instagram}, goal_tiktok = ${previous.goal_tiktok},
        pay_every_days = ${previous.pay_every_days}, notes = ${previous.notes},
        last_paid_at = ${previous.last_paid_at}
    WHERE id = ${creatorId}
  `
  revalidateAdmin(creatorId)
  return { ok: true as const }
}

// --- Projects ---

export async function createProjectFromAssistant(input: { name: string }) {
  const name = input.name.trim()
  if (!name) return { ok: false as const, error: 'Project name is required.' }
  const rows = (await sql`
    INSERT INTO projects (name) VALUES (${name}) RETURNING id
  `) as { id: number }[]
  const projectId = rows[0]?.id
  revalidateAdmin()
  return { ok: true as const, projectId, name }
}

export async function undoProjectCreate(input: { projectId: number }) {
  await sql`UPDATE creators SET project_id = NULL WHERE project_id = ${input.projectId}`
  await sql`UPDATE submissions SET project_id = NULL WHERE project_id = ${input.projectId}`
  await sql`DELETE FROM projects WHERE id = ${input.projectId}`
  revalidateAdmin()
  return { ok: true as const }
}
