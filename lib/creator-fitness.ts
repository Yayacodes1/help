import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import type {
  FitnessAction,
  FitnessBoard,
  FitnessRow,
  FitnessTier,
} from '@/lib/creator-fitness-copy'

export type {
  FitnessAction,
  FitnessBoard,
  FitnessRow,
  FitnessSort,
  FitnessTier,
} from '@/lib/creator-fitness-copy'
export { sortFitnessRows } from '@/lib/creator-fitness-copy'

function clampScore(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)))
}

/** Score 1–5 from views + consistency percentiles. Quwa = 0–100 strong score. */
function scoreFromRanks(
  viewsRankPct: number,
  consistencyRankPct: number,
): { score: number; quwa: number } {
  const viewsStrength = 1 - viewsRankPct
  const consStrength = 1 - consistencyRankPct
  const blended = viewsStrength * 0.55 + consStrength * 0.45
  const quwa = Math.round(blended * 100)
  const score = clampScore(1 + blended * 4)
  return { score, quwa }
}

function actionFrom(score: number, tier: FitnessTier, viewsRank: number): FitnessAction {
  if (tier === 'protected') return 'keep'
  if (tier === 'probation') return 'cut'
  if (viewsRank <= 15 && score >= 4) return 'keep'
  if (score <= 2) return 'cut'
  if (score === 3) return 'watch'
  return score >= 4 ? 'keep' : 'watch'
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
  const daySpan = Math.max(
    1,
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    ) + 1,
  )

  const people = (await sql`
    SELECT
      c.id,
      c.name,
      c.project_id,
      p.name AS project_name,
      c.paused_at::text AS paused_at,
      c.fitness_tier,
      c.probation_started_on::text AS probation_started_on,
      COALESCE(v.views, 0)::bigint AS views,
      COALESCE(v.videos, 0)::int AS videos,
      COALESCE(v.post_days, 0)::int AS post_days
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
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
    WHERE c.role = 'creator'
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
    views: number | string
    videos: number
    post_days: number
  }>

  const normalized = people.map((p) => ({
    ...p,
    views: Number(p.views) || 0,
  }))

  const byViews = [...normalized].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))
  const viewsRank = new Map<number, number>()
  byViews.forEach((p, i) => viewsRank.set(p.id, i + 1))

  const byCons = [...normalized].sort((a, b) => {
    const ca = a.post_days / daySpan
    const cb = b.post_days / daySpan
    return cb - ca || b.views - a.views || a.name.localeCompare(b.name)
  })
  const consRank = new Map<number, number>()
  byCons.forEach((p, i) => consRank.set(p.id, i + 1))

  const n = Math.max(1, normalized.length)
  const totalViews = normalized.reduce((s, p) => s + p.views, 0)
  const top15Views = byViews.slice(0, 15).reduce((s, p) => s + p.views, 0)

  const rows: FitnessRow[] = normalized.map((p) => {
    const vr = viewsRank.get(p.id) ?? n
    const cr = consRank.get(p.id) ?? n
    const consistency = Math.min(1, p.post_days / daySpan)
    const { score, quwa } = scoreFromRanks((vr - 1) / n, (cr - 1) / n)
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
      score,
      quwa,
      action: actionFrom(score, tier, vr),
      tier,
      probationStartedOn: p.probation_started_on,
      paused: p.paused_at != null,
      viewsShare: totalViews > 0 ? p.views / totalViews : 0,
    }
  })

  rows.sort((a, b) => a.quwa - b.quwa || a.views - b.views || a.name.localeCompare(b.name))

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
