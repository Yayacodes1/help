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

function targetTotal(platforms: string | null, ig: number, tt: number): number {
  const mode = normalizePlatforms(platforms)
  const needIg = mode === 'tiktok' ? 0 : Math.max(0, ig)
  const needTt = mode === 'instagram' ? 0 : Math.max(0, tt)
  return needIg + needTt
}

export async function loadPaymentArchive(today: string): Promise<{
  month: string
  people: PaymentArchivePerson[]
  totalSar: number
}> {
  const month = today.slice(0, 7)
  const { start, end } = calendarMonthRange(month)
  const rows = (await sql`
    SELECT p.creator_id, cr.name AS creator_name, cr.role, cr.pay_currency,
           p.amount::float AS amount,
           c.id AS contract_id,
           c.start_date::text AS start_date,
           c.end_date::text AS end_date,
           c.platforms, c.target_instagram, c.target_tiktok
    FROM payments p
    JOIN creators cr ON cr.id = p.creator_id
    LEFT JOIN contracts c ON c.id = p.contract_id
    WHERE p.paid_on >= ${start}::date
      AND p.paid_on <= ${end}::date
    ORDER BY cr.name ASC, p.paid_on ASC, p.id ASC
  `) as {
    creator_id: number
    creator_name: string
    role: ParticipantRole
    pay_currency: string | null
    amount: number
    contract_id: number | null
    start_date: string | null
    end_date: string | null
    platforms: string | null
    target_instagram: number | null
    target_tiktok: number | null
  }[]

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

  const people = [...grouped.values()]
  const ids = [...new Set(people.map((p) => p.creatorId))]
  const starts = people.map((p) => p.start).filter((d): d is string => Boolean(d))
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

  people.sort((a, b) => a.name.localeCompare(b.name))
  return {
    month,
    people,
    totalSar: roundMoney(people.reduce((sum, person) => sum + person.paidSar, 0)),
  }
}
