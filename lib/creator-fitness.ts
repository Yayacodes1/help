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

function actionFrom(opts: {
  strength: number
  tier: FitnessTier
  viewsRank: number
  costPer1k: number | null
  medianCost: number | null
}): FitnessAction {
  if (opts.tier === 'protected') return 'keep'
  if (opts.tier === 'probation') return 'cut'
  // Top 15 by views with solid strength → keep
  if (opts.viewsRank <= 15 && opts.strength >= 60) return 'keep'
  // Expensive vs team median → cut candidate
  if (
    opts.costPer1k != null &&
    opts.medianCost != null &&
    opts.medianCost > 0 &&
    opts.costPer1k > opts.medianCost * 1.35 &&
    opts.strength < 55
  ) {
    return 'cut'
  }
  if (opts.strength < 35) return 'cut'
  if (opts.strength < 55) return 'watch'
  return 'keep'
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
      SELECT COALESCE(SUM(pay.amount), 0)::float AS paid
      FROM payments pay
      WHERE pay.creator_id = c.id
        AND pay.paid_on >= ${from}::date
        AND pay.paid_on <= ${to}::date
    ) pay ON true
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
    created_on: string | null
    first_contract: string | null
    views: number | string
    videos: number
    post_days: number
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
  const viewsRank = new Map<number, number>()
  byViews.forEach((p, i) => viewsRank.set(p.id, i + 1))

  const byCons = [...normalized].sort(
    (a, b) => b.post_days / daySpan - a.post_days / daySpan || b.views - a.views,
  )
  const byRoi = [...normalized]
    .filter((p) => p.viewsPerSar != null)
    .sort((a, b) => (b.viewsPerSar ?? 0) - (a.viewsPerSar ?? 0))

  const costs = normalized
    .map((p) => p.costPer1k)
    .filter((c): c is number => c != null && Number.isFinite(c))
    .sort((a, b) => a - b)
  const medianCost =
    costs.length === 0
      ? null
      : costs.length % 2 === 1
        ? costs[(costs.length - 1) / 2]!
        : (costs[costs.length / 2 - 1]! + costs[costs.length / 2]!) / 2

  const n = Math.max(1, normalized.length)
  const totalViews = normalized.reduce((s, p) => s + p.views, 0)
  const top15Views = byViews.slice(0, 15).reduce((s, p) => s + p.views, 0)

  const rows: FitnessRow[] = normalized.map((p) => {
    const vr = viewsRank.get(p.id) ?? n
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
      strength,
      paid: p.paid,
      costPer1k: p.costPer1k,
      viewsPerSar: p.viewsPerSar,
      daysWithUs: p.daysWithUs,
      joinedOn: p.joinedOn,
      action: actionFrom({
        strength,
        tier,
        viewsRank: vr,
        costPer1k: p.costPer1k,
        medianCost,
      }),
      tier,
      probationStartedOn: p.probation_started_on,
      paused: p.paused_at != null,
      viewsShare: totalViews > 0 ? p.views / totalViews : 0,
    }
  })

  rows.sort((a, b) => {
    const order = { cut: 0, watch: 1, keep: 2 }
    return order[a.action] - order[b.action] || a.strength - b.strength || a.views - b.views
  })

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
