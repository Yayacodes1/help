import 'server-only'
import { sql } from '@/lib/db'
import { getLeaderForCreator, getLeaderScope } from '@/lib/leaders'
import { getCreatorByName } from '@/lib/queries'
import type { RefreshJobActor } from '@/lib/refresh-job'
import { creatorIsPaused } from '@/lib/pause-person'

export async function reposterRefreshContext(
  username: string,
): Promise<{ actor: RefreshJobActor; teamIds: number[] } | null> {
  let name = username
  try {
    name = decodeURIComponent(username)
  } catch {
    name = username
  }
  const creator = await getCreatorByName(name)
  if (!creator || creator.role !== 'reposter' || (await creatorIsPaused(creator.id))) return null
  const link = await getLeaderForCreator(creator.id)
  if (!link) return null
  const scope = await getLeaderScope(link.leaderId)
  const teamIds = scope.teamIds.filter((id) => id !== creator.id)
  if (teamIds.length === 0) return null
  return {
    actor: { kind: 'reposter', actorId: String(creator.id), leaderId: link.leaderId },
    teamIds,
  }
}

/** Keep only videos that belong to this reposter's creators. */
export async function teamSubmissionIds(ids: unknown, teamIds: number[]): Promise<number[]> {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((id) => Math.floor(Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (clean.length === 0 || teamIds.length === 0) return []
  const rows = (await sql`
    SELECT id FROM submissions
    WHERE id = ANY(${clean}::int[])
      AND creator_id = ANY(${teamIds}::int[])
  `) as { id: number }[]
  return rows.map((row) => row.id)
}
