import 'server-only'
import { sql } from '@/lib/db'
import { getCreatorsWithProgressOnDate } from '@/lib/queries'

export type TeamRole = 'creator' | 'reposter'

export type TeamGoal = {
  project_id: number
  role: TeamRole
  target: number
  by_date: string | null
}

export type TeamCount = {
  projectId: number
  projectName: string
  creators: number
  reposters: number
}

export async function ensureTeamGoalsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS team_goals (
      project_id INT NOT NULL,
      role TEXT NOT NULL,
      target INT NOT NULL,
      by_date DATE,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, role)
    )
  `
}

export async function getTeamGoals(): Promise<TeamGoal[]> {
  await ensureTeamGoalsTable()
  return (await sql`
    SELECT project_id, role, target, by_date::text AS by_date FROM team_goals
  `) as TeamGoal[]
}

/** Active (not paused) people per project, counted the same way as the side-by-side columns. */
export async function getTeamCounts(
  projects: Array<{ id: number; name: string }>,
  day: string,
): Promise<TeamCount[]> {
  return Promise.all(
    projects.map(async (p) => {
      const people = (
        await getCreatorsWithProgressOnDate(day, p.id, null, { projectMembersOnly: true })
      ).filter((c) => !c.paused_at)
      return {
        projectId: p.id,
        projectName: p.name,
        creators: people.filter((c) => c.role !== 'reposter').length,
        reposters: people.filter((c) => c.role === 'reposter').length,
      }
    }),
  )
}
