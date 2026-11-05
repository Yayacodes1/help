import 'server-only'
import { sql } from '@/lib/db'
import type { Contract, Creator } from '@/lib/db'
import { shiftYearMonth } from '@/lib/biweekly'
import type { ConsistencySummary } from '@/lib/consistency'
import { scheduleFromContract } from '@/lib/posting-schedule'
import {
  contractPlatforms,
  getActiveContract,
  getConsistencyForWindow,
  getCreatorById,
  getServerToday,
  goalsForContract,
} from '@/lib/queries'
import type { PlatformsMode } from '@/lib/platforms-mode'
import type { ParticipantRole } from '@/lib/participant-role'
import { getAdminTalkMarksForDay } from '@/lib/admin-talk-marks'
import { isMiyqatProjectName, isNotekProjectName } from '@/lib/project-scope'

export type CreatorPeriodPerson = {
  id: number
  name: string
  role: ParticipantRole
  projectId: number | null
  projectName: string | null
  /**
   * Every project this person belongs to: home project, brand handles
   * (Notek / Miqat), and any project they have posted under.
   */
  projectIds: number[]
  /** Marked “Talk to them today” for the operational day. */
  talkToday: boolean
}

export type CreatorPeriodLook = {
  today: string
  from: string
  to: string
  creator: Creator & { project_name: string | null }
  contract: Contract | null
  consistency: ConsistencySummary
  /** Daily goals for the contract covering the end of the range. */
  goalInstagram: number
  goalTiktok: number
  platforms: PlatformsMode
  videos: number
  videosInstagram: number
  videosTiktok: number
  /** Sum of daily goals over scored days in the range. */
  expectedVideos: number
  expectedInstagram: number
  expectedTiktok: number
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
  /** Day used for “Talk to them today” marks (defaults to server today). */
  talkDay?: string | null
} = {}): Promise<CreatorPeriodPerson[]> {
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null
  const talkDay =
    opts.talkDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.talkDay)
      ? opts.talkDay
      : await getServerToday()

  const [projectRows, rows, talkMarks, submissionProjects] = await Promise.all([
    sql`SELECT id, name FROM projects` as unknown as Promise<
      Array<{ id: number; name: string }>
    >,
    sql`
      SELECT
        c.id,
        c.name,
        c.role,
        c.project_id,
        p.name AS project_name,
        c.notek_tiktok_username,
        c.notek_instagram_username,
        c.miqat_tiktok_username,
        c.miqat_instagram_username
      FROM creators c
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.paused_at IS NULL
        AND c.role IN ('creator', 'reposter')
        AND (${role}::text IS NULL OR c.role = ${role})
      ORDER BY c.name ASC
    ` as unknown as Promise<
      Array<{
        id: number
        name: string
        role: string
        project_id: number | null
        project_name: string | null
        notek_tiktok_username: string | null
        notek_instagram_username: string | null
        miqat_tiktok_username: string | null
        miqat_instagram_username: string | null
      }>
    >,
    getAdminTalkMarksForDay(talkDay),
    sql`
      SELECT DISTINCT creator_id, project_id
      FROM submissions
      WHERE project_id IS NOT NULL
    ` as unknown as Promise<Array<{ creator_id: number; project_id: number }>>,
  ])

  const notekId =
    projectRows.find((p) => isNotekProjectName(p.name))?.id ?? null
  const miqatId =
    projectRows.find((p) => isMiyqatProjectName(p.name))?.id ?? null

  const postedByCreator = new Map<number, Set<number>>()
  for (const row of submissionProjects) {
    const cid = Number(row.creator_id)
    const pid = Number(row.project_id)
    if (!Number.isFinite(cid) || !Number.isFinite(pid)) continue
    const set = postedByCreator.get(cid) ?? new Set<number>()
    set.add(pid)
    postedByCreator.set(cid, set)
  }

  const people: CreatorPeriodPerson[] = []
  for (const row of rows) {
    const id = Number(row.id)
    const homeId = row.project_id != null ? Number(row.project_id) : null
    const ids = new Set<number>()
    if (homeId != null && Number.isFinite(homeId)) ids.add(homeId)
    for (const pid of postedByCreator.get(id) ?? []) ids.add(pid)
    const hasNotekHandle = Boolean(
      row.notek_tiktok_username?.trim() || row.notek_instagram_username?.trim(),
    )
    const hasMiqatHandle = Boolean(
      row.miqat_tiktok_username?.trim() || row.miqat_instagram_username?.trim(),
    )
    if (hasNotekHandle && notekId != null) ids.add(notekId)
    if (hasMiqatHandle && miqatId != null) ids.add(miqatId)
    // Unassigned people appear under every project filter (same as Manage).
    if (homeId == null) {
      for (const p of projectRows) ids.add(Number(p.id))
    }

    if (projectId != null && !ids.has(projectId) && row.role !== 'reposter') {
      continue
    }

    people.push({
      id,
      name: String(row.name),
      role: row.role === 'reposter' ? 'reposter' : 'creator',
      projectId: homeId,
      projectName: row.project_name ?? null,
      projectIds: [...ids],
      talkToday: talkMarks.has(id),
    })
  }
  return people
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
  const platforms = contractPlatforms(creator, contract)
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
        COALESCE(SUM(CASE WHEN s.platform = 'instagram' THEN 1 ELSE 0 END), 0)::int AS videos_instagram,
        COALESCE(SUM(CASE WHEN s.platform = 'tiktok' THEN 1 ELSE 0 END), 0)::int AS videos_tiktok,
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
        videos_instagram: number
        videos_tiktok: number
        views: number
        views_instagram: number
        views_tiktok: number
        days_posted: number
      }[]
    >,
  ])

  const row = agg[0]
  const requiredDays = consistency.days.filter(
    (d) =>
      d.date >= from &&
      d.date <= to &&
      d.date <= today &&
      (d.status === 'hit' || d.status === 'partial' || d.status === 'miss'),
  )
  const daysRequired = requiredDays.length
  let expectedInstagram = 0
  let expectedTiktok = 0
  for (const d of requiredDays) {
    expectedInstagram += Math.max(0, d.goalInstagram)
    expectedTiktok += Math.max(0, d.goalTiktok)
  }
  const expectedVideos = expectedInstagram + expectedTiktok

  return {
    today,
    from,
    to,
    creator: { ...creator, project_name: projectName },
    contract,
    goalInstagram: goals.goalInstagram,
    goalTiktok: goals.goalTiktok,
    platforms,
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
    videosInstagram: row?.videos_instagram ?? 0,
    videosTiktok: row?.videos_tiktok ?? 0,
    expectedVideos,
    expectedInstagram,
    expectedTiktok,
    views: row?.views ?? 0,
    viewsInstagram: row?.views_instagram ?? 0,
    viewsTiktok: row?.views_tiktok ?? 0,
    daysPosted: row?.days_posted ?? 0,
    daysRequired,
  }
}
