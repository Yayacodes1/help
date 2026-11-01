import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { normalizePlatforms, videoCompletionRate } from '@/lib/platforms-mode'
import type { ParticipantRole } from '@/lib/participant-role'

export type ContractEndPerson = {
  id: number
  name: string
  role: ParticipantRole
  start: string
  end: string
  videos: number
  target: number
  instagram: number
  tiktok: number
  needInstagram: number
  needTiktok: number
  /** The end date has passed and the required videos are not finished. */
  warning: boolean
}

export type ContractEndGroup = {
  key: string
  /** Null for the warning group. 0 is this week, 1 is next week. */
  offset: number | null
  rangeStart: string | null
  rangeEnd: string | null
  people: ContractEndPerson[]
}

export type ContractEndsModel = {
  thisWeek: number
  groups: ContractEndGroup[]
}

/** Sunday–Saturday week, matching the Riyadh work week. */
export function weekStartSunday(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -day)
}

export function weekOffset(today: string, end: string): number {
  const from = weekStartSunday(today)
  const to = weekStartSunday(end)
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000 / 7)
}

export async function loadContractEnds(
  today: string,
  role: ParticipantRole | null,
): Promise<ContractEndsModel> {
  const rows = (await sql`
    SELECT
      cr.id AS creator_id,
      cr.name,
      cr.role,
      c.start_date::text AS start_date,
      c.end_date::text AS end_date,
      c.target_instagram,
      c.target_tiktok,
      c.platforms,
      COALESCE(v.instagram, 0)::int AS instagram,
      COALESCE(v.tiktok, 0)::int AS tiktok
    FROM creators cr
    JOIN LATERAL (
      SELECT id, start_date, end_date, target_instagram, target_tiktok, platforms
      FROM contracts
      WHERE creator_id = cr.id
        AND end_date IS NOT NULL
      ORDER BY
        CASE
          WHEN start_date <= ${today}::date AND end_date >= ${today}::date THEN 0
          WHEN end_date >= ${today}::date THEN 1
          ELSE 2
        END,
        CASE WHEN end_date >= ${today}::date THEN end_date END ASC,
        start_date DESC,
        id DESC
      LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE platform = 'instagram')::int AS instagram,
        COUNT(*) FILTER (WHERE platform = 'tiktok')::int AS tiktok
      FROM submissions s
      WHERE s.creator_id = cr.id
        AND s.video_date >= (c.start_date - 1)
        AND s.video_date <= (c.end_date + 1)
    ) v ON true
    WHERE cr.paused_at IS NULL
      AND (${role}::text IS NULL OR cr.role = ${role})
  `) as {
    creator_id: number
    name: string
    role: string
    start_date: string
    end_date: string
    target_instagram: number
    target_tiktok: number
    platforms: string | null
    instagram: number
    tiktok: number
  }[]

  const people: ContractEndPerson[] = []
  for (const row of rows) {
    const mode = normalizePlatforms(row.platforms)
    const needInstagram = mode === 'tiktok' ? 0 : Math.max(0, row.target_instagram)
    const needTiktok = mode === 'instagram' ? 0 : Math.max(0, row.target_tiktok)
    const target = needInstagram + needTiktok
    const rate = videoCompletionRate({
      postedInstagram: row.instagram,
      postedTiktok: row.tiktok,
      targetInstagram: row.target_instagram,
      targetTiktok: row.target_tiktok,
      platforms: row.platforms,
    })
    const videosDone = target <= 0 || (rate != null && rate >= 0.999)
    if (row.end_date < today && videosDone) continue
    const roleName = row.role === 'reposter' ? 'reposter' : 'creator'
    people.push({
      id: row.creator_id,
      name: row.name,
      role: roleName,
      start: row.start_date,
      end: row.end_date,
      videos: row.instagram + row.tiktok,
      target,
      instagram: row.instagram,
      tiktok: row.tiktok,
      needInstagram,
      needTiktok,
      warning: row.end_date <= today && !videosDone,
    })
  }

  const thisWeek = people.filter((person) => weekOffset(today, person.end) === 0).length
  const warned = people
    .filter((person) => weekOffset(today, person.end) < 0)
    .sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name))
  const upcoming = new Map<number, ContractEndPerson[]>()
  for (const person of people) {
    const offset = weekOffset(today, person.end)
    if (offset < 0) continue
    const list = upcoming.get(offset) ?? []
    list.push(person)
    upcoming.set(offset, list)
  }

  const groups: ContractEndGroup[] = []
  if (warned.length > 0) {
    groups.push({
      key: 'warning',
      offset: null,
      rangeStart: null,
      rangeEnd: null,
      people: warned,
    })
  }
  for (const offset of [...upcoming.keys()].sort((a, b) => a - b)) {
    const start = addDays(weekStartSunday(today), offset * 7)
    const list = upcoming.get(offset) ?? []
    list.sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name))
    groups.push({
      key: `week-${offset}`,
      offset,
      rangeStart: start,
      rangeEnd: addDays(start, 6),
      people: list,
    })
  }

  return { thisWeek, groups }
}
