import 'server-only'
import { sql } from '@/lib/db'
import { monthRange } from '@/lib/campaign'
import type { DayProgress } from '@/lib/consistency'
import { getConsistencyForCreators, getServerToday, type CreatorWithProject } from '@/lib/queries'
import type { ParticipantRole } from '@/lib/participant-role'

export type AdminConsistencyRow = {
  id: number
  name: string
  role: ParticipantRole
  projectName: string | null
  contractName: string | null
  hitRate: number
  currentStreak: number
  bestStreak: number
  missDays: number
  partialDays: number
  hitDays: number
  requiredDays: number
  recent: DayProgress[]
}

export type AdminConsistencyBoard = {
  today: string
  /** First day of the month being scored (inclusive). */
  monthStart: string
  rows: AdminConsistencyRow[]
}

/** Roster consistency for admin People → Consistency (active people only).
 *  Hit / miss / partial counts are for the current calendar month (1st → today). */
export async function getAdminConsistencyBoard(opts: {
  projectId?: number | null
  role?: ParticipantRole | null
} = {}): Promise<AdminConsistencyBoard> {
  const today = await getServerToday()
  const { start: monthStart } = monthRange(today)
  const projectId = opts.projectId ?? null
  const role = opts.role ?? null

  const people = (await sql`
    SELECT c.id, c.name, c.token, c.project_id, c.created_at, c.role, c.pay_currency,
           c.biweekly_amount::float AS biweekly_amount,
           c.goal_instagram, c.goal_tiktok, c.platforms,
           c.contract_start::text AS contract_start,
           c.contract_end::text AS contract_end,
           c.last_paid_at::text AS last_paid_at,
           c.pay_every_days, c.notes, c.tiktok_username, c.instagram_username, c.login_platform,
           c.notek_tiktok_username, c.notek_instagram_username,
           c.miqat_tiktok_username, c.miqat_instagram_username,
           c.paused_at::text AS paused_at,
           p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.paused_at IS NULL
      AND c.role IN ('creator', 'reposter')
      AND (${role}::text IS NULL OR c.role = ${role})
      AND (
        ${projectId}::int IS NULL
        OR c.project_id = ${projectId}
        OR c.project_id IS NULL
        OR EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.creator_id = c.id AND s.project_id = ${projectId}
        )
      )
    ORDER BY c.name ASC
  `) as CreatorWithProject[]

  const packed = await getConsistencyForCreators(people, today)

  const rows: AdminConsistencyRow[] = people.map((person) => {
    const pack = packed.get(person.id)
    const consistency = pack?.consistency
    const monthDays = (consistency?.days ?? []).filter(
      (d) =>
        d.date >= monthStart &&
        d.date <= today &&
        (d.status === 'hit' || d.status === 'partial' || d.status === 'miss'),
    )
    const hitDays = monthDays.filter((d) => d.status === 'hit').length
    const missDays = monthDays.filter((d) => d.status === 'miss').length
    const partialDays = monthDays.filter((d) => d.status === 'partial').length
    const requiredDays = monthDays.length
    const hitRate = requiredDays > 0 ? hitDays / requiredDays : 0
    // Dots = every scored day from the 1st of this month through today.
    const recent = (consistency?.days ?? []).filter(
      (d) => d.date >= monthStart && d.date <= today && d.status !== 'future',
    )
    return {
      id: person.id,
      name: person.name,
      role: person.role === 'reposter' ? 'reposter' : 'creator',
      projectName: person.project_name ?? null,
      contractName: pack?.active?.name ?? null,
      hitRate,
      currentStreak: consistency?.currentStreak ?? 0,
      bestStreak: consistency?.bestStreak ?? 0,
      missDays,
      partialDays,
      hitDays,
      requiredDays,
      recent,
    }
  })

  rows.sort((a, b) => {
    if (a.hitRate !== b.hitRate) return a.hitRate - b.hitRate
    if (b.missDays !== a.missDays) return b.missDays - a.missDays
    return a.name.localeCompare(b.name)
  })

  return { today, monthStart, rows }
}
