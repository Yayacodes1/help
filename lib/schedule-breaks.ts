import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'

function inclusiveDayCount(start: string, end: string): number {
  if (start > end) return 0
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

export async function applyScheduleBreak(opts: {
  creatorId: number
  start: string
  end: string
  reason: string | null
}): Promise<{ days: number; daysAdded: number } | null> {
  const creatorId = opts.creatorId
  const start = opts.start
  const end = opts.end
  if (!Number.isFinite(creatorId) || creatorId <= 0 || !start || !end || end < start) return null
  const days = inclusiveDayCount(start, end)
  const today = await getServerToday()
  const reason = opts.reason ? opts.reason.slice(0, 500) : null

  const active = (await sql`
    SELECT id, end_date::text AS end_date
    FROM contracts
    WHERE creator_id = ${creatorId}
      AND start_date <= ${today}::date
      AND (end_date IS NULL OR end_date >= ${today}::date)
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  `) as { id: number; end_date: string | null }[]
  const contract = active[0]
  let daysAdded = 0
  let extendedContractId: number | null = null
  if (contract?.end_date) {
    const nextEnd = addDays(contract.end_date, days)
    await sql`UPDATE contracts SET end_date = ${nextEnd}::date WHERE id = ${contract.id}`
    daysAdded = days
    extendedContractId = contract.id
  }

  await sql`
    INSERT INTO schedule_breaks (
      creator_id, start_date, end_date, reason, days_added, extended_contract_id
    )
    VALUES (
      ${creatorId}, ${start}, ${end}, ${reason}, ${daysAdded}, ${extendedContractId}
    )
  `
  const { restoreCreatorStreak } = await import('@/lib/streak-restore')
  await restoreCreatorStreak(creatorId, today)
  return { days, daysAdded }
}

export async function applyScheduleBreaks(
  creatorIds: number[],
  start: string,
  end: string,
  reason: string | null,
): Promise<number> {
  const ids = [...new Set(creatorIds.filter((id) => Number.isFinite(id) && id > 0))]
  let count = 0
  for (const id of ids) {
    const result = await applyScheduleBreak({ creatorId: id, start, end, reason })
    if (result) count += 1
  }
  return count
}
