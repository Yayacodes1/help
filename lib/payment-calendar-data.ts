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
} from '@/lib/payment-calendar'

export async function loadPaymentCalendar(opts: {
  month: string
  today: string
  role?: string | null
}): Promise<PaymentCalendarModel> {
  const role = parseCalendarRole(opts.role)
  const { start, end } = calendarMonthRange(opts.month)
  const roleSql: ParticipantRole | null = role === 'all' ? null : role
  const lookback = addDays(start, -40)
  const lookahead = addDays(end, 40)

  const [contractRows, paymentRows, videoRows, board] = await Promise.all([
    sql`
      SELECT c.id AS contract_id, c.name AS contract_name,
             c.start_date::text AS start_date,
             c.end_date::text AS end_date,
             c.base_amount::float AS base_amount,
             c.commission_amount::float AS commission_amount,
             COALESCE(NULLIF(c.base_pay_cadence, ''), 'monthly') AS base_pay_cadence,
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
        AND (${roleSql}::text IS NULL OR cr.role = ${roleSql})
      ORDER BY p.paid_on ASC, p.id ASC
    `,
    sql`
      SELECT s.creator_id, s.video_date::text AS video_date, s.platform
      FROM submissions s
      JOIN creators cr ON cr.id = s.creator_id
      WHERE s.video_date >= ${lookback}::date
        AND s.video_date <= ${lookahead}::date
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

  return buildPaymentCalendarModel({
    month: opts.month,
    today: opts.today,
    role,
    contracts,
    payments,
    videos,
    commissionEarnedSar: board.totals.commissionEarned,
    commissionRecordedSar: 0,
    commissionDueSar: Math.max(0, board.totals.commissionEarned),
  })
}
