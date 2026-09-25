import 'server-only'
import { sql, type CreatorStrike } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import {
  CORRECTIVE_STRIKE_COUNT,
  STRIKE_LOOKBACK_DAYS,
  lastCompletedOperationalDay,
  strikeLimit,
} from '@/lib/operational-day'

export { CORRECTIVE_STRIKE_COUNT, STRIKE_LOOKBACK_DAYS, strikeLimit }

export type ReposterStrikeRow = {
  creatorId: number
  name: string
  contractId: number | null
  contractName: string | null
  contractStart: string | null
  contractEnd: string | null
  contractStrikes: number
  maxStrikes: number
  todayVideos: number
  postedToday: boolean
  missedToday: boolean
  onBreak: boolean
  lastStrikeDate: string | null
  needsCorrective: boolean
}

export type StrikeBoard = {
  today: string
  lastCompleted: string
  missingToday: number
  withContractStrikes: number
  needsCorrective: number
  rows: ReposterStrikeRow[]
}

export type CreatorStrikeSummary = {
  today: string
  lastCompleted: string
  contractId: number | null
  contractStrikes: number
  maxStrikes: number
  postedToday: boolean
  todayVideos: number
  needsCorrective: boolean
  strikes: CreatorStrike[]
}

function asStrike(row: CreatorStrike): CreatorStrike {
  return {
    ...row,
    source: row.source === 'manual' ? 'manual' : 'auto',
    status: row.status === 'waived' ? 'waived' : 'active',
  }
}

export async function syncReposterStrikes(opts: {
  today: string
  creatorId?: number
}): Promise<number> {
  const today = opts.today
  const lastCompleted = lastCompletedOperationalDay(today)
  const lookbackStart = addDays(lastCompleted, -(STRIKE_LOOKBACK_DAYS - 1))
  const start = lookbackStart <= lastCompleted ? lookbackStart : lastCompleted
  const creatorId = opts.creatorId ?? null

  if (start > lastCompleted) return 0

  const inserted = (await sql`
    INSERT INTO creator_strikes (creator_id, contract_id, strike_date, source, status, reason)
    SELECT
      c.id,
      ct.id,
      days.d,
      'auto',
      'active',
      'Did not post'
    FROM generate_series(${start}::date, ${lastCompleted}::date, interval '1 day') AS days(d)
    JOIN creators c ON c.role = 'reposter'
      AND (${creatorId}::int IS NULL OR c.id = ${creatorId})
    JOIN LATERAL (
      SELECT id
      FROM contracts
      WHERE creator_id = c.id
        AND start_date <= days.d
        AND (end_date IS NULL OR end_date >= days.d)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    ) ct ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.creator_id = c.id AND s.video_date = days.d
    )
    AND NOT EXISTS (
      SELECT 1 FROM schedule_breaks b
      WHERE b.creator_id = c.id
        AND b.start_date <= days.d
        AND b.end_date >= days.d
    )
    AND NOT EXISTS (
      SELECT 1 FROM creator_strikes x
      WHERE x.creator_id = c.id AND x.strike_date = days.d
    )
    ON CONFLICT (creator_id, strike_date) DO NOTHING
    RETURNING id
  `) as { id: number }[]

  return inserted.length
}

export async function getStrikesForCreator(
  creatorId: number,
  opts: { contractId?: number | null; activeOnly?: boolean } = {},
): Promise<CreatorStrike[]> {
  const contractId = opts.contractId ?? null
  const activeOnly = opts.activeOnly !== false
  const rows = (await sql`
    SELECT id, creator_id, contract_id,
           strike_date::text AS strike_date,
           source, status, reason, created_at
    FROM creator_strikes
    WHERE creator_id = ${creatorId}
      AND (${activeOnly}::boolean IS NOT TRUE OR status = 'active')
      AND (${contractId}::int IS NULL OR contract_id = ${contractId})
    ORDER BY strike_date DESC, id DESC
  `) as CreatorStrike[]
  return rows.map(asStrike)
}

export async function getCreatorStrikeSummary(
  creatorId: number,
  today: string,
): Promise<CreatorStrikeSummary> {
  const lastCompleted = lastCompletedOperationalDay(today)
  const [contractRows, strikeRows, postRows] = (await Promise.all([
    sql`
      SELECT id, COALESCE(max_strikes, ${CORRECTIVE_STRIKE_COUNT})::int AS max_strikes
      FROM contracts
      WHERE creator_id = ${creatorId}
        AND start_date <= ${today}::date
        AND (end_date IS NULL OR end_date >= ${today}::date)
      ORDER BY start_date DESC, id DESC
      LIMIT 1
    `,
    sql`
      SELECT id, creator_id, contract_id,
             strike_date::text AS strike_date,
             source, status, reason, created_at
      FROM creator_strikes
      WHERE creator_id = ${creatorId}
        AND status = 'active'
      ORDER BY strike_date DESC, id DESC
    `,
    sql`
      SELECT COUNT(*)::int AS videos
      FROM submissions
      WHERE creator_id = ${creatorId} AND video_date = ${today}::date
    `,
  ])) as [
    { id: number; max_strikes: number }[],
    CreatorStrike[],
    { videos: number }[],
  ]

  const contractId = contractRows[0]?.id ?? null
  const maxStrikes = strikeLimit(contractRows[0]?.max_strikes)
  const strikes = strikeRows.map(asStrike)
  const contractStrikes = contractId
    ? strikes.filter((s) => s.contract_id === contractId).length
    : strikes.length
  const todayVideos = postRows[0]?.videos ?? 0

  return {
    today,
    lastCompleted,
    contractId,
    contractStrikes,
    maxStrikes,
    postedToday: todayVideos > 0,
    todayVideos,
    needsCorrective: contractStrikes >= maxStrikes,
    strikes: contractId ? strikes.filter((s) => s.contract_id === contractId) : strikes,
  }
}

export async function getReposterStrikeBoard(today: string): Promise<StrikeBoard> {
  const lastCompleted = lastCompletedOperationalDay(today)

  const [people, contracts, strikeRows, postRows, breakRows] = (await Promise.all([
    sql`
      SELECT id, name FROM creators
      WHERE role = 'reposter'
      ORDER BY name ASC
    `,
    sql`
      SELECT DISTINCT ON (creator_id)
        id, creator_id, name,
        start_date::text AS start_date,
        end_date::text AS end_date,
        COALESCE(max_strikes, ${CORRECTIVE_STRIKE_COUNT})::int AS max_strikes
      FROM contracts
      WHERE start_date <= ${today}::date
        AND (end_date IS NULL OR end_date >= ${today}::date)
      ORDER BY creator_id, start_date DESC, id DESC
    `,
    sql`
      SELECT creator_id, contract_id,
             strike_date::text AS strike_date
      FROM creator_strikes
      WHERE status = 'active'
    `,
    sql`
      SELECT creator_id, COUNT(*)::int AS videos
      FROM submissions
      WHERE video_date = ${today}::date
      GROUP BY creator_id
    `,
    sql`
      SELECT creator_id
      FROM schedule_breaks
      WHERE start_date <= ${today}::date AND end_date >= ${today}::date
    `,
  ])) as [
    Array<{ id: number; name: string }>,
    Array<{
      id: number
      creator_id: number
      name: string
      start_date: string
      end_date: string | null
      max_strikes: number
    }>,
    Array<{ creator_id: number; contract_id: number | null; strike_date: string }>,
    Array<{ creator_id: number; videos: number }>,
    Array<{ creator_id: number }>,
  ]

  const contractByCreator = new Map(contracts.map((c) => [c.creator_id, c]))
  const postsByCreator = new Map(postRows.map((p) => [p.creator_id, p.videos]))
  const onBreak = new Set(breakRows.map((b) => b.creator_id))

  const strikesByCreator = new Map<
    number,
    { count: number; last: string | null }
  >()
  for (const row of strikeRows) {
    const contract = contractByCreator.get(row.creator_id)
    if (contract) {
      if (row.contract_id != null && row.contract_id !== contract.id) continue
      if (
        row.contract_id == null &&
        (row.strike_date < contract.start_date ||
          (contract.end_date != null && row.strike_date > contract.end_date))
      ) {
        continue
      }
    }
    const prev = strikesByCreator.get(row.creator_id) ?? { count: 0, last: null }
    prev.count += 1
    if (!prev.last || row.strike_date > prev.last) prev.last = row.strike_date
    strikesByCreator.set(row.creator_id, prev)
  }

  const rows: ReposterStrikeRow[] = people.map((p) => {
    const contract = contractByCreator.get(p.id) ?? null
    const todayVideos = postsByCreator.get(p.id) ?? 0
    const strikeInfo = strikesByCreator.get(p.id) ?? { count: 0, last: null }
    const maxStrikes = strikeLimit(contract?.max_strikes)
    const breaking = onBreak.has(p.id)
    const missedToday = !breaking && todayVideos === 0 && contract != null
    return {
      creatorId: p.id,
      name: p.name,
      contractId: contract?.id ?? null,
      contractName: contract?.name ?? null,
      contractStart: contract?.start_date ?? null,
      contractEnd: contract?.end_date ?? null,
      contractStrikes: strikeInfo.count,
      maxStrikes,
      todayVideos,
      postedToday: todayVideos > 0,
      missedToday,
      onBreak: breaking,
      lastStrikeDate: strikeInfo.last,
      needsCorrective: strikeInfo.count >= maxStrikes,
    }
  })

  rows.sort((a, b) => {
    if (a.needsCorrective !== b.needsCorrective) return a.needsCorrective ? -1 : 1
    if (b.contractStrikes !== a.contractStrikes) return b.contractStrikes - a.contractStrikes
    if (a.missedToday !== b.missedToday) return a.missedToday ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    today,
    lastCompleted,
    missingToday: rows.filter((r) => r.missedToday).length,
    withContractStrikes: rows.filter((r) => r.contractStrikes > 0).length,
    needsCorrective: rows.filter((r) => r.needsCorrective).length,
    rows,
  }
}
