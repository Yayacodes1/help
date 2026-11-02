import 'server-only'
import { sql } from '@/lib/db'
import { calendarMonthRange } from '@/lib/campaign'
import { payCurrency } from '@/lib/format'
import { amountToSar, roundMoney } from '@/lib/payment-calendar-math'
import { normalizePlatforms } from '@/lib/platforms-mode'
import type { ParticipantRole } from '@/lib/participant-role'

export type PaymentArchivePerson = {
  key: string
  creatorId: number
  name: string
  role: ParticipantRole
  paidSar: number
  start: string | null
  end: string | null
  finished: boolean
  videoCount: number
  targetTotal: number
}

export type PaymentArchiveMonth = {
  month: string
  totalSar: number
  people: PaymentArchivePerson[]
}

type PaymentRow = {
  creator_id: number
  creator_name: string
  role: ParticipantRole
  pay_currency: string | null
  amount: number
  paid_on: string
  contract_id: number | null
  start_date: string | null
  end_date: string | null
  platforms: string | null
  target_instagram: number | null
  target_tiktok: number | null
}

function targetTotal(platforms: string | null, ig: number, tt: number): number {
  const mode = normalizePlatforms(platforms)
  const needIg = mode === 'tiktok' ? 0 : Math.max(0, ig)
  const needTt = mode === 'instagram' ? 0 : Math.max(0, tt)
  return needIg + needTt
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function eachMonth(start: string, end: string): string[] {
  const months: string[] = []
  let cursor = start
  while (cursor <= end && months.length < 60) {
    months.push(cursor)
    cursor = shiftMonth(cursor, 1)
  }
  return months
}

function groupMonth(rows: PaymentRow[], today: string): PaymentArchivePerson[] {
  const grouped = new Map<string, PaymentArchivePerson>()
  for (const row of rows) {
    const key = `${row.creator_id}:${row.contract_id ?? 0}`
    const currency = payCurrency(row.role, row.pay_currency)
    const sar = amountToSar(Number(row.amount) || 0, currency)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        key,
        creatorId: row.creator_id,
        name: row.creator_name,
        role: row.role,
        paidSar: sar,
        start: row.start_date,
        end: row.end_date,
        finished: Boolean(row.end_date && row.end_date <= today),
        videoCount: 0,
        targetTotal: targetTotal(row.platforms, row.target_instagram ?? 0, row.target_tiktok ?? 0),
      })
    } else {
      existing.paidSar = roundMoney(existing.paidSar + sar)
    }
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadPaymentArchive(today: string): Promise<{
  months: PaymentArchiveMonth[]
  summaryFrom: string
  summaryTo: string
}> {
  const current = today.slice(0, 7)
  const recentStart = shiftMonth(current, -2)
  const recentEnd = shiftMonth(current, 3)
  const bounds = (await sql`
    SELECT MIN(paid_on)::text AS first_paid, MAX(paid_on)::text AS last_paid
    FROM payments
  `) as { first_paid: string | null; last_paid: string | null }[]
  const earliest = bounds[0]?.first_paid?.slice(0, 7) || recentStart
  const latest = bounds[0]?.last_paid?.slice(0, 7) || recentEnd
  const { start } = calendarMonthRange(earliest < recentStart ? earliest : recentStart)
  const { end } = calendarMonthRange(latest > recentEnd ? latest : recentEnd)

  const rows = (await sql`
    SELECT p.creator_id, cr.name AS creator_name, cr.role, cr.pay_currency,
           p.amount::float AS amount,
           p.paid_on::text AS paid_on,
           c.id AS contract_id,
           c.start_date::text AS start_date,
           c.end_date::text AS end_date,
           c.platforms, c.target_instagram, c.target_tiktok
    FROM payments p
    JOIN creators cr ON cr.id = p.creator_id
    LEFT JOIN contracts c ON c.id = p.contract_id
    WHERE p.paid_on >= ${start}::date
      AND p.paid_on <= ${end}::date
      AND cr.paused_at IS NULL
    ORDER BY p.paid_on ASC, cr.name ASC, p.id ASC
  `) as PaymentRow[]

  const byMonth = new Map<string, PaymentRow[]>()
  for (const row of rows) {
    const month = row.paid_on.slice(0, 7)
    const list = byMonth.get(month) ?? []
    list.push(row)
    byMonth.set(month, list)
  }

  const monthSet = new Set<string>([...byMonth.keys(), ...eachMonth(recentStart, recentEnd)])
  const months = [...monthSet].sort()
  const built = months.map((month) => {
    const people = groupMonth(byMonth.get(month) ?? [], today)
    return {
      month,
      people,
      totalSar: roundMoney(people.reduce((sum, person) => sum + person.paidSar, 0)),
    }
  })

  const people = built.flatMap((month) => month.people)
  const ids = [...new Set(people.map((person) => person.creatorId))]
  const starts = people.map((person) => person.start).filter((date): date is string => Boolean(date))
  const minStart = starts.sort()[0]
  if (ids.length > 0 && minStart) {
    const hits = (await sql`
      SELECT creator_id, video_date::text AS video_date
      FROM submissions
      WHERE creator_id = ANY(${ids}::int[])
        AND video_date >= ${minStart}::date
        AND video_date <= ${today}::date
    `) as { creator_id: number; video_date: string }[]
    for (const person of people) {
      if (!person.start) continue
      const last = person.end && person.end < today ? person.end : today
      person.videoCount = hits.filter(
        (hit) =>
          hit.creator_id === person.creatorId &&
          hit.video_date >= person.start! &&
          hit.video_date <= last,
      ).length
      if (person.targetTotal > 0 && person.videoCount >= person.targetTotal) person.finished = true
    }
  }

  let summaryFrom = months[0] ?? current
  for (let i = 1; i < months.length; i++) {
    if (months[i] !== shiftMonth(months[i - 1], 1)) summaryFrom = months[i]
  }
  return {
    months: built,
    summaryFrom,
    summaryTo: months[months.length - 1] ?? current,
  }
}
