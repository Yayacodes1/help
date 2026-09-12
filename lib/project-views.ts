import 'server-only'
import { sql } from '@/lib/db'
import { monthRange } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import type { ParticipantRole } from '@/lib/participant-role'
import { sortProjects } from '@/lib/project-order'

export { sortProjects }

export type ProjectViewsProject = {
  id: number
  name: string
}

export type ProjectViewsPerson = {
  creatorId: number
  name: string
  role: ParticipantRole
  viewsByProject: Record<number, number>
  videosByProject: Record<number, number>
  unassignedViews: number
  unassignedVideos: number
  viewsInstagram: number
  viewsTiktok: number
  views: number
  videos: number
}

export type ProjectViewsTotals = {
  viewsByProject: Record<number, number>
  videosByProject: Record<number, number>
  unassignedViews: number
  unassignedVideos: number
  views: number
  videos: number
  viewsInstagram: number
  viewsTiktok: number
}

export type ProjectViewsBoard = {
  from: string
  to: string
  projects: ProjectViewsProject[]
  roster: Array<{ id: number; name: string; role: ParticipantRole }>
  people: ProjectViewsPerson[]
  totals: ProjectViewsTotals
}

type AggRow = {
  creator_id: number
  project_id: number | null
  platform: string | null
  views: number
  videos: number
}

function normalizeRange(from?: string | null, to?: string | null, today?: string) {
  const t = today ?? new Date().toISOString().slice(0, 10)
  const month = monthRange(t)
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : month.start
  const e = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : month.end
  return { from: f, to: e }
}

/** Per-person views split across projects, plus combined totals. */
export async function getProjectViewsBoard(opts: {
  from?: string | null
  to?: string | null
  role?: ParticipantRole | null
} = {}): Promise<ProjectViewsBoard> {
  const today = await getServerToday()
  const { from, to } = normalizeRange(opts.from, opts.to, today)
  const role = opts.role ?? null

  const [projectRows, roster, aggs] = await Promise.all([
    sql`
      SELECT id, name FROM projects ORDER BY name ASC
    `,
    sql`
      SELECT id, name, role FROM creators
      WHERE (${role}::text IS NULL OR role = ${role})
      ORDER BY name ASC
    `,
    sql`
      SELECT
        c.id AS creator_id,
        s.project_id,
        s.platform,
        COALESCE(SUM(s.views), 0)::int AS views,
        COUNT(s.id)::int AS videos
      FROM creators c
      LEFT JOIN submissions s
        ON s.creator_id = c.id
        AND s.video_date >= ${from}::date
        AND s.video_date <= ${to}::date
      WHERE (${role}::text IS NULL OR c.role = ${role})
      GROUP BY c.id, s.project_id, s.platform
    `,
  ])
  const projects = sortProjects(projectRows as ProjectViewsProject[])
  const peopleRoster = roster as Array<{ id: number; name: string; role: ParticipantRole }>
  const aggRows = aggs as AggRow[]
  const byId = new Map<number, ProjectViewsPerson>()

  for (const person of peopleRoster) {
    byId.set(person.id, {
      creatorId: person.id,
      name: person.name,
      role: person.role,
      viewsByProject: {},
      videosByProject: {},
      unassignedViews: 0,
      unassignedVideos: 0,
      viewsInstagram: 0,
      viewsTiktok: 0,
      views: 0,
      videos: 0,
    })
  }

  for (const row of aggRows) {
    const person = byId.get(row.creator_id)
    if (!person) continue
    const views = Number(row.views) || 0
    const videos = Number(row.videos) || 0
    person.views += views
    person.videos += videos
    if (row.platform === 'instagram') person.viewsInstagram += views
    if (row.platform === 'tiktok') person.viewsTiktok += views
    if (row.project_id == null) {
      if (videos > 0) {
        person.unassignedViews += views
        person.unassignedVideos += videos
      }
      continue
    }
    person.viewsByProject[row.project_id] = (person.viewsByProject[row.project_id] ?? 0) + views
    person.videosByProject[row.project_id] = (person.videosByProject[row.project_id] ?? 0) + videos
  }

  const people = [...byId.values()].sort((a, b) => {
    if (b.views !== a.views) return b.views - a.views
    return a.name.localeCompare(b.name)
  })

  const totals: ProjectViewsTotals = {
    viewsByProject: {},
    videosByProject: {},
    unassignedViews: 0,
    unassignedVideos: 0,
    views: 0,
    videos: 0,
    viewsInstagram: 0,
    viewsTiktok: 0,
  }

  for (const person of people) {
    totals.views += person.views
    totals.videos += person.videos
    totals.viewsInstagram += person.viewsInstagram
    totals.viewsTiktok += person.viewsTiktok
    totals.unassignedViews += person.unassignedViews
    totals.unassignedVideos += person.unassignedVideos
    for (const p of projects) {
      totals.viewsByProject[p.id] =
        (totals.viewsByProject[p.id] ?? 0) + (person.viewsByProject[p.id] ?? 0)
      totals.videosByProject[p.id] =
        (totals.videosByProject[p.id] ?? 0) + (person.videosByProject[p.id] ?? 0)
    }
  }

  return { from, to, projects, roster: peopleRoster, people, totals }
}
