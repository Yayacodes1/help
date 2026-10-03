'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { ensureTeamGoalsTable } from '@/lib/team-goals'

/** Set (or clear, with an empty target) how many creators/reposters a project should have by a date. */
export async function saveTeamGoal(formData: FormData) {
  const session = await getAdminSession()
  if (!session) throw new Error('Unauthorized')

  const projectId = Number(formData.get('project_id'))
  const role = formData.get('role')
  if (!Number.isInteger(projectId) || projectId <= 0) return
  if (role !== 'creator' && role !== 'reposter') return

  const targetRaw = (formData.get('target') ?? '').toString().trim()
  const dateRaw = (formData.get('by_date') ?? '').toString().trim()
  const byDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

  await ensureTeamGoalsTable()
  const target = Number(targetRaw)
  if (!targetRaw || !Number.isFinite(target) || target <= 0) {
    await sql`DELETE FROM team_goals WHERE project_id = ${projectId} AND role = ${role}`
  } else {
    await sql`
      INSERT INTO team_goals (project_id, role, target, by_date, updated_by, updated_at)
      VALUES (${projectId}, ${role}, ${Math.round(target)}, ${byDate}, ${session.id}, NOW())
      ON CONFLICT (project_id, role) DO UPDATE
        SET target = EXCLUDED.target,
            by_date = EXCLUDED.by_date,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
    `
  }
  revalidatePath('/admin')
}
