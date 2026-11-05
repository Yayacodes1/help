import 'server-only'
import { sql } from '@/lib/db'
import type { Contract, Creator } from '@/lib/db'
import { shiftYearMonth } from '@/lib/biweekly'
import type { ConsistencySummary } from '@/lib/consistency'
import { scheduleFromContract } from '@/lib/posting-schedule'
import {
  getActiveContract,
  getConsistencyForWindow,
  getCreatorById,
  getServerToday,
  goalsForContract,
} from '@/lib/queries'
import type { ParticipantRole } from '@/lib/participant-role'

export type CreatorPeriodPerson = {
  id: number
  name: string
  role: ParticipantRole
  projectName: string | null
}

export type CreatorPeriodLook = {
  today: string
  from: string
  to: string
  creator: Creator & { project_name: string | null }
  contract: Contract | null
  consistency: ConsistencySummary
  videos: number
  views: number
  viewsInstagram: number
  viewsTiktok: number
  /** Calendar days with at least one video in the range. */
  daysPosted: number
  /** Scored days in the range (hit + partial + miss). */
  daysRequired: number
}

/** Default: first day of last calendar month → today (e.g. Oct 1 → Nov 5). */
export function defaultCreatorPeriodRange(today: string): { from: string; to: string } {
  const lastMonth = shiftYearMonth(today.slice(0, 7), -1)
  return { from: `${lastMonth}-01`, to: today }
}

export async function listCreatorsForPeriodLook(opts: {
  projectId?: number | null
  role?: ParticipantRole | null
} = {}): Promise<CreatorPeriodPerson[]> {
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const rows = (await sql`
    SELECT c.id, c.name, c.role, p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.paused_at IS NULL
      AND c.role IN ('creator', 'reposter')
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (
        ${projectId}::int IS NULL
        OR c.project_id = ${projectId}
        OR c.project_id IS NULL
      )
    ORDER BY c.name ASC
  `) as Array<{ id: number; name: string; role: string; project_name: string | null }>
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    role: row.role === 'reposter' ? 'reposter' : 'creator',
    projectName: row.project_name ?? null,
  }))
}

export async function getCreatorPeriodLook(opts: {
  creatorId: number
  from?: string | null
  to?: string | null
}): Promise<CreatorPeriodLook | null> {
  const today = await getServerToday()
  const defaults = defaultCreatorPeriodRange(today)
  const from =
    opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : defaults.from
  const toRaw = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : defaults.to
  const to = toRaw > today ? today : toRaw
  if (from > to) return null

  const creator = await getCreatorById(opts.creatorId)
  if (!creator) return null

  const projectRows = (await sql`
    SELECT name FROM projects WHERE id = ${creator.project_id} LIMIT 1
  `) as { name: string }[]
  const projectName = projectRows[0]?.name ?? null

  // Goals/schedule as of the end of the selected window (past months use that day’s contract).
  const contract = await getActiveContract(creator.id, to)
  const goals = goalsForContract(creator, contract)
  const schedule = scheduleFromContract(contract)

  const [consistency, agg] = await Promise.all([
    getConsistencyForWindow(
      creator,
      from,
      to,
      today,
      goals,
      { windowStart: from, streakEpochStart: from, streakEpochEnd: to },
      schedule,
    ),
    sql`
      SELECT
        COUNT(s.id)::int AS videos,
        COALESCE(SUM(s.views), 0)::int AS views,
        COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN s.views ELSE 0 END), 0)::int AS views_instagram,
        COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN s.views ELSE 0 END), 0)::int AS views_tiktok,
        COUNT(DISTINCT s.video_date)::int AS days_posted
      FROM submissions s
      WHERE s.creator_id = ${creator.id}
        AND s.video_date >= ${from}::date
        AND s.video_date <= ${to}::date
    ` as unknown as Promise<
      {
        videos: number
        views: number
        views_instagram: number
        views_tiktok: number
        days_posted: number
      }[]
    >,
  ])

  const row = agg[0]
  const daysRequired = consistency.days.filter(
    (d) =>
      d.date >= from &&
      d.date <= to &&
      d.date <= today &&
      (d.status === 'hit' || d.status === 'partial' || d.status === 'miss'),
  ).length

  return {
    today,
    from,
    to,
    creator: { ...creator, project_name: projectName },
    contract,
    consistency: {
      ...consistency,
      // Clip calendar to the selected window only.
      days: consistency.days.filter((d) => d.date >= from && d.date <= to),
      hitDays: consistency.days.filter(
        (d) => d.date >= from && d.date <= to && d.date <= today && d.status === 'hit',
      ).length,
      missDays: consistency.days.filter(
        (d) => d.date >= from && d.date <= to && d.date <= today && d.status === 'miss',
      ).length,
      partialDays: consistency.days.filter(
        (d) => d.date >= from && d.date <= to && d.date <= today && d.status === 'partial',
      ).length,
      requiredDays: daysRequired,
      hitRate:
        daysRequired > 0
          ? consistency.days.filter(
              (d) => d.date >= from && d.date <= to && d.date <= today && d.status === 'hit',
            ).length / daysRequired
          : 0,
    },
    videos: row?.videos ?? 0,
    views: row?.views ?? 0,
    viewsInstagram: row?.views_instagram ?? 0,
    viewsTiktok: row?.views_tiktok ?? 0,
    daysPosted: row?.days_posted ?? 0,
    daysRequired,
  }
}
