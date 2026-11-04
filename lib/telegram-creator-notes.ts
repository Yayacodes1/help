import 'server-only'
import { sql } from '@/lib/db'
import { addDays } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import {
  PROBATION_LEVEL_THRESHOLDS,
  buildCreatorConsistencyMessage,
  buildCreatorWelcomeMessage,
  type ProbationLevel,
} from '@/lib/probation-copy'

function dayCountInclusive(start: string, end: string): number {
  if (!start || !end || start > end) return 0
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1)
}

export type CreatorNotePerson = {
  id: number
  name: string
  projectName: string | null
}

/** Active (not fired) creators for Telegram pickers. */
export async function listCreatorsForTelegramNotes(
  nameQuery?: string | null,
): Promise<CreatorNotePerson[]> {
  const q = (nameQuery ?? '').trim()
  const rows = (await sql`
    SELECT c.id, c.name, p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.role = 'creator'
      AND c.paused_at IS NULL
      AND (
        ${q}::text = ''
        OR c.name ILIKE ${'%' + q + '%'}
      )
    ORDER BY c.name ASC
  `) as Array<{ id: number; name: string; project_name: string | null }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectName: r.project_name,
  }))
}

export function creatorNotesPickerButtons(
  people: CreatorNotePerson[],
  kind: 'fit' | 'welcome',
  page = 0,
) {
  const pageSize = 24
  const start = page * pageSize
  const slice = people.slice(start, start + pageSize)
  const rows = slice.map((p) => [
    {
      text: p.projectName ? `${p.name} · ${p.projectName}` : p.name,
      callback_data: `${kind}:${p.id}`,
    },
  ])
  const nav: Array<{ text: string; callback_data: string }> = []
  if (page > 0) nav.push({ text: '← Prev', callback_data: `${kind}page:${page - 1}` })
  if (start + pageSize < people.length) {
    nav.push({ text: 'Next →', callback_data: `${kind}page:${page + 1}` })
  }
  if (nav.length) rows.push(nav)
  rows.push([{ text: '🔄 Refresh menu', callback_data: 'upd' }])
  return { inline_keyboard: rows }
}

export async function getCreatorCheckInStats(creatorId: number): Promise<{
  name: string
  daysWithUs: number
  windowConsistencyPct: number
  allConsistencyPct: number | null
  missDays: number
  streakLevel: ProbationLevel | 0
  onProbation: boolean
} | null> {
  const today = await getServerToday()
  const from = addDays(today, -29)
  const daySpan = dayCountInclusive(from, today)

  const rows = (await sql`
    SELECT
      c.id,
      c.name,
      c.fitness_tier,
      c.probation_started_on::text AS probation_started_on,
      c.created_at::date::text AS created_on,
      ct.first_contract::text AS first_contract,
      COALESCE(v.post_days, 0)::int AS post_days,
      COALESCE(life.contract_days, 0)::int AS all_contract_days,
      COALESCE(life.post_days, 0)::int AS all_post_days
    FROM creators c
    LEFT JOIN LATERAL (
      SELECT MIN(start_date)::date AS first_contract
      FROM contracts
      WHERE creator_id = c.id
    ) ct ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT s.video_date)::int AS post_days
      FROM submissions s
      WHERE s.creator_id = c.id
        AND s.video_date >= ${from}::date
        AND s.video_date <= ${today}::date
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
    WHERE c.id = ${creatorId}
      AND c.role = 'creator'
    LIMIT 1
  `) as Array<{
    id: number
    name: string
    fitness_tier: string | null
    probation_started_on: string | null
    created_on: string | null
    first_contract: string | null
    post_days: number
    all_contract_days: number
    all_post_days: number
  }>

  const p = rows[0]
  if (!p) return null

  const joinedOn =
    p.first_contract && p.created_on
      ? p.first_contract < p.created_on
        ? p.first_contract
        : p.created_on
      : p.first_contract ?? p.created_on
  const daysWithUs = joinedOn ? dayCountInclusive(joinedOn, today) : 0
  const windowConsistencyPct = Math.round(
    Math.min(1, (p.post_days || 0) / Math.max(1, daySpan)) * 100,
  )
  const allDays = Math.max(0, p.all_contract_days || 0)
  const allConsistencyPct =
    allDays > 0
      ? Math.round(Math.min(1, (p.all_post_days || 0) / allDays) * 100)
      : null

  const onProbation = p.fitness_tier === 'probation'
  let missDays = 0
  let streakLevel: ProbationLevel | 0 = 0

  if (onProbation && p.probation_started_on) {
    const { getCreatorProbationSnapshot } = await import('@/lib/probation')
    const snap = await getCreatorProbationSnapshot(creatorId, today)
    if (snap) {
      missDays = snap.missCount
      streakLevel = snap.streakLevel
    }
  }

  return {
    name: p.name,
    daysWithUs,
    windowConsistencyPct,
    allConsistencyPct,
    missDays,
    streakLevel,
    onProbation,
  }
}

export async function buildConsistencyNoteForCreator(creatorId: number): Promise<string | null> {
  const stats = await getCreatorCheckInStats(creatorId)
  if (!stats) return null
  return buildCreatorConsistencyMessage(stats)
}

export async function buildWelcomeNoteForCreator(creatorId: number): Promise<string | null> {
  const rows = (await sql`
    SELECT name FROM creators WHERE id = ${creatorId} AND role = 'creator' LIMIT 1
  `) as { name: string }[]
  if (!rows[0]) return null
  return buildCreatorWelcomeMessage(rows[0].name)
}

export function consistencyPickerPrompt(count: number, query?: string | null): string {
  const q = (query ?? '').trim()
  return (
    `📊 CONSISTENCY CHECK-IN · ${count} creator${count === 1 ? '' : 's'}` +
    (q ? ` matching “${q}”` : '') +
    `\nTap a name for a copy-ready Arabic message (days with us, %, target ≥67%, upload page).\n` +
    `Tip: /fitness Sara — look up by name. /welcome — new-creator intro.`
  )
}

export function welcomePickerPrompt(count: number, query?: string | null): string {
  const q = (query ?? '').trim()
  return (
    `👋 NEW CREATOR INTRO · ${count} creator${count === 1 ? '' : 's'}` +
    (q ? ` matching “${q}”` : '') +
    `\nTap a name for a copy-ready Arabic welcome (system + ≥67% + streaks 3→6→10).\n` +
    `Tip: /welcome Sara — look up by name. /fitness — consistency check-in.`
  )
}

export { PROBATION_LEVEL_THRESHOLDS }
