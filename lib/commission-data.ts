import 'server-only'
import { sql, type CommissionSettings, type Platform } from '@/lib/db'
import type { ParticipantRole } from '@/lib/participant-role'
import {
  HOUSE_COMMISSION,
  buildCommissionBoard,
  buildCommissionUnitLines,
  estimateContractCommission,
  normalizeCountMode,
  resolveTerms,
  sumEstimates,
  type CommissionBoard,
  type CommissionEstimate,
  type CommissionEstimateOption,
  type CommissionTerms,
  type CommissionUnitLine,
  type ContractTermsInput,
  type SubmissionDetailInput,
  type SubmissionUnitInput,
} from '@/lib/commission'

function toTerms(row: CommissionSettings | undefined): CommissionTerms {
  return {
    viewsThreshold: row?.views_threshold || HOUSE_COMMISSION.viewsThreshold,
    commissionAmount: Number(row?.commission_amount) || HOUSE_COMMISSION.commissionAmount,
    reelCount: row?.reel_count || HOUSE_COMMISSION.reelCount,
    countMode: normalizeCountMode(row?.count_mode) ?? HOUSE_COMMISSION.countMode,
  }
}

export async function getCommissionSettings(): Promise<CommissionTerms> {
  const rows = (await sql`
    SELECT views_threshold,
           commission_amount::float AS commission_amount,
           reel_count,
           count_mode
    FROM commission_settings
    WHERE id = 1
    LIMIT 1
  `) as CommissionSettings[]
  return toTerms(rows[0])
}

export async function getCommissionBoard(opts: {
  from: string
  to: string
  today: string
  projectId?: number | null
  role?: ParticipantRole | null
  creatorId?: number | null
}): Promise<CommissionBoard> {
  const settings = await getCommissionSettings()
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const creatorId = opts.creatorId ?? null
  const from = opts.from
  const to = opts.to
  const today = opts.today

  const people = (await sql`
    SELECT id, name, role
    FROM creators
    WHERE (${role}::text IS NULL OR role = ${role})
      AND (${projectId}::int IS NULL OR project_id = ${projectId})
      AND (${creatorId}::int IS NULL OR id = ${creatorId})
    ORDER BY name ASC
  `) as { id: number; name: string; role: string }[]

  if (people.length === 0) {
    return buildCommissionBoard({ from, to, settings, people: [] })
  }

  const [subs, pays, contracts] = await Promise.all([
    sql`
      SELECT s.id, s.creator_id, s.platform, s.views,
             s.batch_id, s.batch_index
      FROM submissions s
      JOIN creators cr ON cr.id = s.creator_id
      WHERE s.video_date >= ${from}::date
        AND s.video_date <= ${to}::date
        AND (${role}::text IS NULL OR cr.role = ${role})
        AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
        AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
        AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    `,
    sql`
      SELECT p.creator_id, COALESCE(SUM(p.amount), 0)::float AS paid
      FROM payments p
      JOIN creators cr ON cr.id = p.creator_id
      WHERE p.paid_on >= ${from}::date
        AND p.paid_on <= ${to}::date
        AND (${role}::text IS NULL OR cr.role = ${role})
        AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
        AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
      GROUP BY p.creator_id
    `,
    sql`
      SELECT DISTINCT ON (c.creator_id)
             c.creator_id, c.count_mode, c.views_threshold,
             c.view_commission_amount::float AS view_commission_amount,
             c.commission_reels
      FROM contracts c
      JOIN creators cr ON cr.id = c.creator_id
      WHERE c.start_date <= ${today}::date
        AND (c.end_date IS NULL OR c.end_date >= ${today}::date)
        AND (${role}::text IS NULL OR cr.role = ${role})
        AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
        AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
      ORDER BY c.creator_id, c.start_date DESC, c.id DESC
    `,
  ])

  const subsBy = new Map<number, SubmissionUnitInput[]>()
  for (const s of subs as Array<{
    id: number
    creator_id: number
    platform: Platform
    views: number
    batch_id: string | null
    batch_index: number | null
  }>) {
    const list = subsBy.get(s.creator_id) ?? []
    list.push({
      id: s.id,
      platform: s.platform,
      views: Number(s.views) || 0,
      batch_id: s.batch_id,
      batch_index: s.batch_index,
    })
    subsBy.set(s.creator_id, list)
  }

  const paidBy = new Map<number, number>()
  for (const p of pays as { creator_id: number; paid: number }[]) {
    paidBy.set(p.creator_id, Number(p.paid) || 0)
  }

  const contractBy = new Map<number, ContractTermsInput>()
  for (const c of contracts as Array<ContractTermsInput & { creator_id: number }>) {
    contractBy.set(c.creator_id, {
      count_mode: normalizeCountMode(c.count_mode),
      views_threshold: c.views_threshold,
      view_commission_amount: c.view_commission_amount,
      commission_reels: c.commission_reels,
    })
  }

  return buildCommissionBoard({
    from,
    to,
    settings,
    people: people.map((p) => ({
      creatorId: p.id,
      name: p.name,
      role: p.role,
      paid: paidBy.get(p.id) ?? 0,
      submissions: subsBy.get(p.id) ?? [],
      contract: contractBy.get(p.id) ?? null,
    })),
  })
}

export type CommissionEstimateResult = {
  scope: 'all' | number
  today: string
  options: CommissionEstimateOption[]
  estimate: CommissionEstimate
}

type ContractRow = ContractTermsInput & {
  id: number
  creator_id: number
  creator_name: string
  name: string
  start_date: string
  end_date: string | null
}

export async function getCommissionEstimate(opts: {
  today: string
  projectId?: number | null
  role?: ParticipantRole | null
  creatorId?: number | null
  contractId?: number | null
}): Promise<CommissionEstimateResult> {
  const settings = await getCommissionSettings()
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const creatorId = opts.creatorId ?? null
  const contractId = opts.contractId ?? null
  const today = opts.today

  const contracts = (await sql`
    SELECT c.id, c.creator_id, cr.name AS creator_name, c.name,
           c.start_date::text AS start_date,
           c.end_date::text AS end_date,
           c.count_mode, c.views_threshold,
           c.view_commission_amount::float AS view_commission_amount,
           c.commission_reels
    FROM contracts c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE (${role}::text IS NULL OR cr.role = ${role})
      AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
      AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
    ORDER BY cr.name ASC, c.start_date DESC, c.id DESC
  `) as ContractRow[]

  const options: CommissionEstimateOption[] = contracts.map((c) => ({
    id: c.id,
    creatorId: c.creator_id,
    creatorName: c.creator_name,
    name: c.name,
    startDate: c.start_date,
    endDate: c.end_date,
    isActive:
      c.start_date <= today && (c.end_date == null || c.end_date >= today),
  }))

  const hasPick = contractId != null && contracts.some((c) => c.id === contractId)
  const scoped = hasPick ? contracts.filter((c) => c.id === contractId) : contracts
  const scope: 'all' | number = hasPick && contractId != null ? contractId : 'all'
  const filterId = hasPick ? contractId : null

  if (scoped.length === 0) {
    return {
      scope,
      today,
      options,
      estimate: sumEstimates([]),
    }
  }

  const [subs, pays] = await Promise.all([
    sql`
      SELECT DISTINCT ON (s.id)
             s.id, s.creator_id, s.platform, s.views,
             s.batch_id, s.batch_index, c.id AS contract_id
      FROM submissions s
      JOIN contracts c ON c.creator_id = s.creator_id
        AND s.video_date >= c.start_date
        AND (c.end_date IS NULL OR s.video_date <= c.end_date)
      JOIN creators cr ON cr.id = s.creator_id
      WHERE (${role}::text IS NULL OR cr.role = ${role})
        AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
        AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
        AND (${filterId}::int IS NULL OR c.id = ${filterId})
      ORDER BY s.id, c.start_date DESC, c.id DESC
    `,
    sql`
      SELECT c.id AS contract_id, COALESCE(SUM(p.amount), 0)::float AS recorded
      FROM contracts c
      JOIN creators cr ON cr.id = c.creator_id
      LEFT JOIN payments p ON p.creator_id = c.creator_id
        AND (
          p.contract_id = c.id
          OR (
            p.contract_id IS NULL
            AND p.paid_on >= c.start_date
            AND p.paid_on <= COALESCE(c.end_date, ${today}::date)
          )
        )
      WHERE (${role}::text IS NULL OR cr.role = ${role})
        AND (${projectId}::int IS NULL OR cr.project_id = ${projectId})
        AND (${creatorId}::int IS NULL OR cr.id = ${creatorId})
        AND (${filterId}::int IS NULL OR c.id = ${filterId})
      GROUP BY c.id
    `,
  ])

  const subsBy = new Map<number, SubmissionUnitInput[]>()
  for (const s of subs as Array<
    SubmissionUnitInput & { creator_id: number; contract_id: number }
  >) {
    const list = subsBy.get(s.contract_id) ?? []
    list.push({
      id: s.id,
      platform: s.platform,
      views: Number(s.views) || 0,
      batch_id: s.batch_id,
      batch_index: s.batch_index,
    })
    subsBy.set(s.contract_id, list)
  }

  const recordedBy = new Map<number, number>()
  for (const p of pays as { contract_id: number; recorded: number }[]) {
    recordedBy.set(p.contract_id, Number(p.recorded) || 0)
  }

  const parts = scoped.map((c) => ({
    ...estimateContractCommission({
      terms: resolveTerms(c, settings),
      submissions: subsBy.get(c.id) ?? [],
      recorded: recordedBy.get(c.id) ?? 0,
    }),
    contractCount: 1,
  }))

  return {
    scope,
    today,
    options,
    estimate: sumEstimates(parts),
  }
}

export type CommissionBreakdownResult = {
  scope: 'all' | number
  from: string | null
  to: string | null
  terms: CommissionTerms | null
  lines: CommissionUnitLine[]
  totalSar: number
}

/** Per-video/batch commission lines for one creator, optional contract + date filter. */
export async function getCommissionBreakdown(opts: {
  today: string
  creatorId: number
  contractId?: number | null
  from?: string | null
  to?: string | null
}): Promise<CommissionBreakdownResult> {
  const settings = await getCommissionSettings()
  const creatorId = opts.creatorId
  const contractId = opts.contractId ?? null
  const from = opts.from ?? null
  const to = opts.to ?? null

  const contracts = (await sql`
    SELECT c.id, c.creator_id, cr.name AS creator_name, c.name,
           c.start_date::text AS start_date,
           c.end_date::text AS end_date,
           c.count_mode, c.views_threshold,
           c.view_commission_amount::float AS view_commission_amount,
           c.commission_reels
    FROM contracts c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.creator_id = ${creatorId}
    ORDER BY c.start_date DESC, c.id DESC
  `) as ContractRow[]

  const hasPick = contractId != null && contracts.some((c) => c.id === contractId)
  const scoped = hasPick ? contracts.filter((c) => c.id === contractId) : contracts
  const scope: 'all' | number = hasPick && contractId != null ? contractId : 'all'
  const filterId = hasPick ? contractId : null

  if (scoped.length === 0) {
    return { scope, from, to, terms: null, lines: [], totalSar: 0 }
  }

  const subs = (await sql`
    SELECT DISTINCT ON (s.id)
           s.id, s.creator_id, s.platform, s.views,
           s.batch_id, s.batch_index, c.id AS contract_id,
           s.video_date::text AS video_date,
           s.url
    FROM submissions s
    JOIN contracts c ON c.creator_id = s.creator_id
      AND s.video_date >= c.start_date
      AND (c.end_date IS NULL OR s.video_date <= c.end_date)
    WHERE s.creator_id = ${creatorId}
      AND (${filterId}::int IS NULL OR c.id = ${filterId})
      AND (${from}::date IS NULL OR s.video_date >= ${from}::date)
      AND (${to}::date IS NULL OR s.video_date <= ${to}::date)
    ORDER BY s.id, c.start_date DESC, c.id DESC
  `) as Array<
    SubmissionDetailInput & { creator_id: number; contract_id: number }
  >

  const lines: CommissionUnitLine[] = []
  let termsOut: CommissionTerms | null = null

  for (const c of scoped) {
    const terms = resolveTerms(c, settings)
    if (terms && !termsOut) termsOut = terms
    const contractSubs = subs
      .filter((s) => s.contract_id === c.id)
      .map((s) => ({
        id: s.id,
        platform: s.platform,
        views: Number(s.views) || 0,
        batch_id: s.batch_id,
        batch_index: s.batch_index,
        video_date: s.video_date,
        url: s.url,
      }))
    lines.push(...buildCommissionUnitLines({ terms, submissions: contractSubs }))
  }

  // When multiple contracts, re-sort combined list
  lines.sort((a, b) => {
    if (b.commissionSar !== a.commissionSar) return b.commissionSar - a.commissionSar
    if (b.views !== a.views) return b.views - a.views
    return (b.videoDate ?? '').localeCompare(a.videoDate ?? '')
  })

  const totalSar = Math.round(lines.reduce((s, l) => s + l.commissionSar, 0) * 100) / 100

  return {
    scope,
    from,
    to,
    terms: termsOut,
    lines,
    totalSar,
  }
}
