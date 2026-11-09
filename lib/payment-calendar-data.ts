import 'server-only'
import { sql } from '@/lib/db'
import { addDays, calendarMonthRange } from '@/lib/campaign'
import { getCommissionBoard } from '@/lib/commission-data'
import type { ParticipantRole } from '@/lib/participant-role'
import {
  buildPaymentCalendarModel,
  parseCalendarRole,
  type CalendarContractInput,
  type CalendarPaymentInput,
  type CalendarRoleFilter,
  type CalendarVideoHit,
  type PaymentCalendarModel,
  type ReposterCommissionLine,
} from '@/lib/payment-calendar'
import { reposterViewCommissionSar } from '@/lib/payment-calendar-math'
import { structureContractsForCalendar, structurePaymentsForCalendar } from '@/lib/structure-pay'

export async function loadPaymentCalendar(opts: {
  month: string
  today: string
  role?: string | null
  viewerId?: string | null
}): Promise<PaymentCalendarModel> {
  const role = parseCalendarRole(opts.role)
  const { start, end } = calendarMonthRange(opts.month)
  const roleSql: ParticipantRole | null = role === 'creator' || role === 'reposter' ? role : null
  const lookback = addDays(start, -90)
  const lookahead = addDays(end, 40)

  const [contractRows, paymentRows, videoRows, board] = await Promise.all([
    sql`
      SELECT c.id AS contract_id, c.name AS contract_name,
             c.start_date::text AS start_date,
             c.end_date::text AS end_date,
             c.base_amount::float AS base_amount,
             c.commission_amount::float AS commission_amount,
             COALESCE(NULLIF(c.base_pay_cadence, ''), 'monthly') AS base_pay_cadence,
             c.pay_timing,
             c.first_pay_amount::float AS first_pay_amount,
             c.second_pay_amount::float AS second_pay_amount,
             c.first_pay_on::text AS first_pay_on,
             c.second_pay_on::text AS second_pay_on,
             COALESCE(c.pay_slice_overrides, '{}'::jsonb) AS pay_slice_overrides,
             c.target_instagram, c.target_tiktok, c.platforms,
             COALESCE(cr.pay_every_days, 14)::int AS pay_every_days,
             cr.id AS creator_id, cr.name AS creator_name, cr.role,
             cr.pay_currency, cr.paused_at::text AS paused_at,
             cr.project_id, p.name AS project_name
      FROM contracts c
      JOIN creators cr ON cr.id = c.creator_id
      LEFT JOIN projects p ON p.id = cr.project_id
      WHERE c.start_date <= ${lookahead}::date
        AND (c.end_date IS NULL OR c.end_date >= ${lookback}::date)
        AND cr.paused_at IS NULL
        AND (${roleSql}::text IS NULL OR cr.role = ${roleSql})
      ORDER BY cr.name ASC, c.start_date ASC, c.id ASC
    `,
    sql`
      SELECT p.id, p.creator_id, p.contract_id,
             p.paid_on::text AS paid_on,
             p.amount::float AS amount,
             p.note,
             cr.name AS creator_name, cr.role, cr.pay_currency,
             ct.name AS contract_name
      FROM payments p
      JOIN creators cr ON cr.id = p.creator_id
      LEFT JOIN contracts ct ON ct.id = p.contract_id
      WHERE p.paid_on >= ${lookback}::date
        AND p.paid_on <= ${lookahead}::date
        AND cr.paused_at IS NULL
        AND (${roleSql}::text IS NULL OR cr.role = ${roleSql})
      ORDER BY p.paid_on ASC, p.id ASC
    `,
    sql`
      SELECT s.creator_id, s.video_date::text AS video_date, s.platform
      FROM submissions s
      JOIN creators cr ON cr.id = s.creator_id
      WHERE s.video_date >= ${lookback}::date
        AND s.video_date <= ${lookahead}::date
        AND cr.paused_at IS NULL
        AND s.platform IN ('instagram', 'tiktok')
        AND (${roleSql}::text IS NULL OR cr.role = ${roleSql})
    `,
    getCommissionBoard({
      from: start,
      to: end,
      today: opts.today,
      role: roleSql,
    }),
  ])

  const contracts: CalendarContractInput[] = (
    contractRows as Array<{
      contract_id: number
      contract_name: string
      start_date: string
      end_date: string | null
      base_amount: number
      commission_amount: number | null
      base_pay_cadence: string
      pay_timing: string | null
      first_pay_amount: number | null
      second_pay_amount: number | null
      first_pay_on: string | null
      second_pay_on: string | null
      pay_slice_overrides: Record<string, { on?: string | null; amount?: number | null }> | null
      target_instagram: number
      target_tiktok: number
      platforms: string | null
      pay_every_days: number
      creator_id: number
      creator_name: string
      role: ParticipantRole
      pay_currency: string | null
      paused_at: string | null
      project_id: number | null
      project_name: string | null
    }>
  ).map((row) => ({
    contractId: row.contract_id,
    contractName: row.contract_name,
    startDate: row.start_date,
    endDate: row.end_date,
    baseAmount: Number(row.base_amount) || 0,
    commissionAmount: row.commission_amount == null ? null : Number(row.commission_amount),
    basePayCadence: row.base_pay_cadence,
    payTiming: row.pay_timing,
    firstPayAmount: row.first_pay_amount == null ? null : Number(row.first_pay_amount),
    secondPayAmount: row.second_pay_amount == null ? null : Number(row.second_pay_amount),
    firstPayOn: row.first_pay_on,
    secondPayOn: row.second_pay_on,
    sliceOverrides: row.pay_slice_overrides,
    targetInstagram: row.target_instagram,
    targetTiktok: row.target_tiktok,
    platforms: row.platforms,
    payEveryDays: row.pay_every_days,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    role: row.role,
    payCurrency: row.pay_currency,
    pausedAt: row.paused_at,
    projectId: row.project_id,
    projectName: row.project_name,
  }))

  const payments: CalendarPaymentInput[] = (
    paymentRows as Array<{
      id: number
      creator_id: number
      contract_id: number | null
      paid_on: string
      amount: number
      note: string | null
      creator_name: string
      role: ParticipantRole
      pay_currency: string | null
      contract_name: string | null
    }>
  ).map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    contractId: row.contract_id,
    paidOn: row.paid_on,
    amount: Number(row.amount) || 0,
    note: row.note,
    creatorName: row.creator_name,
    role: row.role,
    payCurrency: row.pay_currency,
    contractName: row.contract_name,
  }))

  const videos: CalendarVideoHit[] = (
    videoRows as Array<{ creator_id: number; video_date: string; platform: 'instagram' | 'tiktok' }>
  ).map((row) => ({
    creatorId: row.creator_id,
    videoDate: row.video_date,
    platform: row.platform,
  }))

  if (role === 'all' || role === 'company') {
    try {
      const [structure, structurePays] = await Promise.all([
        structureContractsForCalendar(opts.viewerId, opts.today),
        structurePaymentsForCalendar(opts.viewerId, opts.today),
      ])
      contracts.push(...structure)
      payments.push(...structurePays)
    } catch (err) {
      console.error('[calendar] structure pay', err)
    }
  }

  const shared = {
    today: opts.today,
    role,
    contracts,
    payments,
    videos,
  }
  const reposterCommission = role === 'reposter' ? await loadReposterCommission(start, end) : []
  const reposterCommissionSar = roundCommission(reposterCommission.reduce((sum, row) => sum + row.sar, 0))
  const current = buildPaymentCalendarModel({
    ...shared,
    month: opts.month,
    commissionEarnedSar:
      role === 'company' ? 0 : role === 'reposter' ? reposterCommissionSar : board.totals.commissionEarned,
    commissionRecordedSar: 0,
    commissionDueSar:
      role === 'company' ? 0 : role === 'reposter' ? reposterCommissionSar : Math.max(0, board.totals.commissionEarned),
  })
  const nextMonth = addDays(end, 1).slice(0, 7)
  const next = buildPaymentCalendarModel({
    ...shared,
    month: nextMonth,
    commissionEarnedSar: 0,
    commissionRecordedSar: 0,
    commissionDueSar: 0,
  })
  return {
    ...current,
    reposterCommission,
    nextMonth,
    nextScheduledSar: next.scheduledTotalSar,
    nextScheduledUsd: next.scheduledTotalUsd,
  }
}

function roundCommission(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100
}

/** Views on videos posted in the month. Each reposter is one row, so the pay is not added twice. */
async function loadReposterCommission(start: string, end: string): Promise<ReposterCommissionLine[]> {
  const rows = (await sql`
    SELECT cr.id, cr.name, COALESCE(SUM(s.views), 0)::float AS views
    FROM creators cr
    JOIN submissions s ON s.creator_id = cr.id
      AND s.video_date >= ${start}::date
      AND s.video_date <= ${end}::date
    WHERE cr.role = 'reposter'
    GROUP BY cr.id, cr.name
    HAVING COALESCE(SUM(s.views), 0) > 0
    ORDER BY views DESC, cr.name ASC
  `) as Array<{ id: number; name: string; views: number }>
  return rows.map((row) => {
    const views = Math.max(0, Math.floor(Number(row.views) || 0))
    return {
      creatorId: row.id,
      name: row.name,
      views,
      sar: reposterViewCommissionSar(views),
    }
  })
}
