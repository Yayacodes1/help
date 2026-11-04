import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import type { FitnessBoard, FitnessRow, FitnessTier } from '@/lib/creator-fitness-copy'

export type {
  FitnessBoard,
  FitnessRow,
  FitnessSort,
  FitnessTier,
} from '@/lib/creator-fitness-copy'
export { sortFitnessRows } from '@/lib/creator-fitness-copy'

function dayCountInclusive(start: string, end: string): number {
  if (!start || !end || start > end) return 0
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1)
}

function percentileRank(orderedBestFirst: number[], id: number, ids: number[]): number {
  const n = Math.max(1, ids.length)
  const idx = orderedBestFirst.indexOf(id)
  if (idx < 0) return 0
  return 1 - idx / n
}

export async function getCreatorFitnessBoard(opts: {
  from?: string | null
  to?: string | null
  projectId?: number | null
} = {}): Promise<FitnessBoard> {
  const today = await getServerToday()
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : today
  const from =
    opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : addDays(to, -29)
  const projectId = opts.projectId ?? null
  const daySpan = Math.max(1, dayCountInclusive(from, to))

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.project_id,
      p.name AS project_name,
      c.paused_at::text AS paused_at,
      c.fitness_tier,
      c.probation_started_on::text AS probation_started_on,
      c.created_at::date::text AS created_on,
      ct.first_contract::text AS first_contract,
      COALESCE(v.views, 0)::bigint AS views,
      COALESCE(v.videos, 0)::int AS videos,
      COALESCE(v.post_days, 0)::int AS post_days,
      COALESCE(life.contract_days, 0)::int AS all_contract_days,
      COALESCE(life.post_days, 0)::int AS all_post_days,
      COALESCE(pay.paid, 0)::float AS paid
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    LEFT JOIN LATERAL (
      SELECT MIN(start_date)::date AS first_contract
      FROM contracts
      WHERE creator_id = c.id
    ) ct ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(s.views), 0)::bigint AS views,
        COUNT(s.id)::int AS videos,
        COUNT(DISTINCT s.video_date)::int AS post_days
      FROM submissions s
      WHERE s.creator_id = c.id
        AND s.video_date >= ${from}::date
        AND s.video_date <= ${to}::date
        AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(
          GREATEST(
            0,
            (
              LEAST(COALESCE(ct.end_date, ${today}::date), ${today}::date)
              - ct.start_date
            ) + 1
          )
        ), 0)::int AS contract_days,
        (
          SELECT COUNT(DISTINCT s.video_date)::int
          FROM submissions s
          WHERE s.creator_id = c.id
            AND EXISTS (
              SELECT 1
              FROM contracts ct2
              WHERE ct2.creator_id = c.id
                AND s.video_date >= ct2.start_date
                AND s.video_date <= LEAST(COALESCE(ct2.end_date, ${today}::date), ${today}::date)
            )
        ) AS post_days
      FROM contracts ct
      WHERE ct.creator_id = c.id
    ) life ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pay.amount), 0)::float AS paid
      FROM payments pay
      WHERE pay.creator_id = c.id
        AND pay.paid_on >= ${from}::date
        AND pay.paid_on <= ${to}::date
    ) pay ON true
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND (${projectId}::int IS NULL OR c.project_id = ${projectId}
           OR EXISTS (
             SELECT 1 FROM submissions sx
             WHERE sx.creator_id = c.id
               AND sx.project_id = ${projectId}
               AND sx.video_date >= ${from}::date
               AND sx.video_date <= ${to}::date
           ))
    ORDER BY c.name ASC
  `) as Array<{
    id: number
    name: string
    project_id: number | null
    project_name: string | null
    paused_at: string | null
    fitness_tier: string | null
    probation_started_on: string | null
    created_on: string | null
    first_contract: string | null
    views: number | string
    videos: number
    post_days: number
    all_contract_days: number
    all_post_days: number
    paid: number
  }>

  const normalized = people.map((p) => {
    const views = Number(p.views) || 0
    const paid = Number(p.paid) || 0
    const joinedOn =
      p.first_contract && p.created_on
        ? p.first_contract < p.created_on
          ? p.first_contract
          : p.created_on
        : p.first_contract ?? p.created_on
    const daysWithUs = joinedOn ? dayCountInclusive(joinedOn, today) : 0
    const costPer1k = views > 0 && paid > 0 ? (paid / views) * 1000 : null
    const viewsPerSar = paid > 0 ? views / paid : null
    return {
      ...p,
      views,
      paid,
      joinedOn,
      daysWithUs,
      costPer1k,
      viewsPerSar,
    }
  })

  const ids = normalized.map((p) => p.id)
  const byViews = [...normalized].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))

  const byCons = [...normalized].sort(
    (a, b) => b.post_days / daySpan - a.post_days / daySpan || b.views - a.views,
  )
  const byRoi = [...normalized]
    .filter((p) => p.viewsPerSar != null)
    .sort((a, b) => (b.viewsPerSar ?? 0) - (a.viewsPerSar ?? 0))

  const totalViews = normalized.reduce((s, p) => s + p.views, 0)
  const top15Views = byViews.slice(0, 15).reduce((s, p) => s + p.views, 0)

  const rows: FitnessRow[] = normalized.map((p) => {
    const viewsPct = percentileRank(
      byViews.map((x) => x.id),
      p.id,
      ids,
    )
    const consPct = percentileRank(
      byCons.map((x) => x.id),
      p.id,
      ids,
    )
    const roiPct =
      p.viewsPerSar == null
        ? 0.35 // unknown pay → mild penalty, don't invent ROI
        : percentileRank(
            byRoi.map((x) => x.id),
            p.id,
            byRoi.map((x) => x.id),
          )
    // One strength number: views + consistency + ROI (money efficiency)
    const strength = Math.round(
      Math.min(100, Math.max(0, (viewsPct * 0.4 + consPct * 0.25 + roiPct * 0.35) * 100)),
    )
    const consistency = Math.min(1, p.post_days / daySpan)
    const allContractDays = Math.max(0, p.all_contract_days || 0)
    const allPostDays = Math.max(0, p.all_post_days || 0)
    const allConsistency =
      allContractDays > 0 ? Math.min(1, allPostDays / allContractDays) : 0
    const tier: FitnessTier =
      p.fitness_tier === 'protected' || p.fitness_tier === 'probation' ? p.fitness_tier : null
    return {
      creatorId: p.id,
      name: p.name,
      projectId: p.project_id,
      projectName: p.project_name,
      views: p.views,
      videos: p.videos,
      postDays: p.post_days,
      daySpan,
      consistency,
      allPostDays,
      allContractDays,
      allConsistency,
      strength,
      paid: p.paid,
      costPer1k: p.costPer1k,
      viewsPerSar: p.viewsPerSar,
      daysWithUs: p.daysWithUs,
      joinedOn: p.joinedOn,
      tier,
      probationStartedOn: p.probation_started_on,
      fired: false,
      viewsShare: totalViews > 0 ? p.views / totalViews : 0,
    }
  })

  rows.sort((a, b) => a.strength - b.strength || a.views - b.views)

  return {
    from,
    to,
    today,
    totalViews,
    top15Views,
    top15Share: totalViews > 0 ? top15Views / totalViews : 0,
    rows,
  }
}

export async function setCreatorFitnessTier(
  creatorId: number,
  tier: FitnessTier,
  today: string,
): Promise<void> {
  if (tier === 'probation') {
    await sql`
      UPDATE creators
      SET fitness_tier = 'probation',
          probation_started_on = ${today}::date
      WHERE id = ${creatorId} AND role = 'creator'
    `
    await sql`DELETE FROM probation_streak_notices WHERE creator_id = ${creatorId}`
  } else if (tier === 'protected') {
    await sql`
      UPDATE creators
      SET fitness_tier = 'protected',
          probation_started_on = NULL
      WHERE id = ${creatorId} AND role = 'creator'
    `
    await sql`DELETE FROM probation_streak_notices WHERE creator_id = ${creatorId}`
  } else {
    await sql`
      UPDATE creators
      SET fitness_tier = NULL,
          probation_started_on = NULL
      WHERE id = ${creatorId} AND role = 'creator'
    `
    await sql`DELETE FROM probation_streak_notices WHERE creator_id = ${creatorId}`
  }
}

export async function creatorIsOnProbation(creatorId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT fitness_tier FROM creators WHERE id = ${creatorId} LIMIT 1
  `) as { fitness_tier: string | null }[]
  return rows[0]?.fitness_tier === 'probation'
}
