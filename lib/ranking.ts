import 'server-only'
import { sql } from '@/lib/db'
import { addDays, monthRange } from '@/lib/campaign'
import { getServerToday } from '@/lib/queries'
import { loginHandleFor, normalizeHandle } from '@/lib/usernames'
import type { ParticipantRole } from '@/lib/participant-role'
import { sortProjects } from '@/lib/project-order'
import type {
  LeagueBoard,
  LeagueDayPoint,
  LeagueProject,
  LeagueRow,
} from '@/lib/ranking-types'

export type { LeagueBoard, LeagueDayPoint, LeagueProject, LeagueRow } from '@/lib/ranking-types'

type AggRow = {
  creator_id: number
  creator_name: string
  tiktok_username: string | null
  instagram_username: string | null
  date: string | null
  project_id: number | null
  project_name: string | null
  platform: string | null
  views: number
  videos: number
}

function ranksFromTotals(
  totals: Map<number, number>,
  names: Map<number, string>,
): Map<number, number> {
  const ordered = [...totals.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return (names.get(a[0]) ?? '').localeCompare(names.get(b[0]) ?? '')
  })
  const ranks = new Map<number, number>()
  ordered.forEach(([id], i) => ranks.set(id, i + 1))
  return ranks
}

export async function getLeagueBoard(opts: {
  from?: string | null
  to?: string | null
  projectId?: number | null
  role?: ParticipantRole | null
  username?: string | null
} = {}): Promise<LeagueBoard> {
  const today = await getServerToday()
  const month = monthRange(today)
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : month.start
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : month.end
  const projectId = opts.projectId ?? null
  const role = opts.role !== undefined ? opts.role : 'reposter'
  const username = normalizeHandle(opts.username)

  const projectRows = (await sql`
    SELECT id, name FROM projects ORDER BY name ASC
  `) as LeagueProject[]
  const projects = sortProjects(projectRows).filter(
    (p) => projectId == null || p.id === projectId,
  )

  const people = (await sql`
    SELECT id, name, role, tiktok_username, instagram_username, login_platform
    FROM creators
    WHERE (${role}::text IS NULL OR role = ${role})
    ORDER BY name ASC
  `) as {
    id: number
    name: string
    role: ParticipantRole
    tiktok_username: string | null
    instagram_username: string | null
    login_platform: string | null
  }[]

  const aggs = (await sql`
    SELECT
      c.id AS creator_id,
      c.name AS creator_name,
      c.tiktok_username,
      c.instagram_username,
      s.video_date::text AS date,
      s.project_id,
      p.name AS project_name,
      s.platform,
      COALESCE(SUM(s.views), 0)::int AS views,
      COUNT(s.id)::int AS videos
    FROM creators c
    LEFT JOIN submissions s
      ON s.creator_id = c.id
      AND s.video_date >= ${from}::date
      AND s.video_date <= ${to}::date
      AND (${projectId}::int IS NULL OR s.project_id = ${projectId})
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE (${role}::text IS NULL OR c.role = ${role})
    GROUP BY c.id, c.name, c.tiktok_username, c.instagram_username,
             s.video_date, s.project_id, p.name, s.platform
  `) as AggRow[]

  const names = new Map<number, string>()
  const roles = new Map<number, ParticipantRole>()
  const meta = new Map<number, {
    tiktokUsername: string | null
    instagramUsername: string | null
    loginHandle: string
    loginPlatform: 'instagram' | 'tiktok'
  }>()
  const dailyViews = new Map<number, Map<string, number>>()
  const totals = new Map<number, number>()
  const ig = new Map<number, number>()
  const tt = new Map<number, number>()
  const videos = new Map<number, number>()
  const byProject = new Map<number, Record<number, number>>()

  for (const p of people) {
    const login = loginHandleFor(p)
    names.set(p.id, p.name)
    roles.set(p.id, p.role === 'reposter' ? 'reposter' : 'creator')
    meta.set(p.id, {
      tiktokUsername: p.tiktok_username,
      instagramUsername: p.instagram_username,
      loginHandle: login.handle || p.name,
      loginPlatform: login.platform,
    })
    dailyViews.set(p.id, new Map())
    totals.set(p.id, 0)
    ig.set(p.id, 0)
    tt.set(p.id, 0)
    videos.set(p.id, 0)
    byProject.set(p.id, {})
  }

  for (const row of aggs) {
    if (!names.has(row.creator_id)) continue
    const views = Number(row.views) || 0
    const vids = Number(row.videos) || 0
    if (row.date) {
      const dayMap = dailyViews.get(row.creator_id)!
      dayMap.set(row.date, (dayMap.get(row.date) ?? 0) + views)
    }
    totals.set(row.creator_id, (totals.get(row.creator_id) ?? 0) + views)
    videos.set(row.creator_id, (videos.get(row.creator_id) ?? 0) + vids)
    if (row.platform === 'instagram') ig.set(row.creator_id, (ig.get(row.creator_id) ?? 0) + views)
    if (row.platform === 'tiktok') tt.set(row.creator_id, (tt.get(row.creator_id) ?? 0) + views)
    if (row.project_id != null) {
      const map = byProject.get(row.creator_id)!
      map[row.project_id] = (map[row.project_id] ?? 0) + views
    }
  }

  const yesterday = addDays(to, -1) < from ? from : addDays(to, -1)
  const todayRanks = ranksFromTotals(totals, names)

  const mtdYesterday = new Map<number, number>()
  for (const id of names.keys()) {
    let sum = 0
    const days = dailyViews.get(id)!
    for (const [date, views] of days) {
      if (date <= yesterday) sum += views
    }
    mtdYesterday.set(id, sum)
  }
  const yesterdayRanks = ranksFromTotals(mtdYesterday, names)

  const sparkStart = addDays(to, -6)
  const sparkDates: string[] = []
  for (let d = sparkStart; d <= to; d = addDays(d, 1)) {
    if (d >= from) sparkDates.push(d)
  }

  let rows: LeagueRow[] = [...names.keys()].map((id) => {
    const rank = todayRanks.get(id) ?? names.size
    const previousRank = yesterday === to ? rank : (yesterdayRanks.get(id) ?? names.size)
    const delta = previousRank - rank
    const viewTotal = totals.get(id) ?? 0
    const videoTotal = videos.get(id) ?? 0
    const info = meta.get(id)!
    return {
      creatorId: id,
      name: names.get(id) ?? '',
      role: roles.get(id) ?? 'creator',
      loginHandle: info.loginHandle,
      loginPlatform: info.loginPlatform,
      tiktokUsername: info.tiktokUsername,
      instagramUsername: info.instagramUsername,
      rank,
      previousRank: yesterday === to ? null : previousRank,
      delta: yesterday === to ? null : delta,
      views: viewTotal,
      viewsInstagram: ig.get(id) ?? 0,
      viewsTiktok: tt.get(id) ?? 0,
      videos: videoTotal,
      avgViews: videoTotal > 0 ? Math.round(viewTotal / videoTotal) : 0,
      viewsByProject: byProject.get(id) ?? {},
      sparkline: sparkDates.map((d) => dailyViews.get(id)?.get(d) ?? 0),
      viewsToNext: null,
    }
  })

  rows.sort((a, b) => a.rank - b.rank)
  for (let i = 0; i < rows.length; i++) {
    const next = rows[i - 1]
    rows[i].viewsToNext = next ? Math.max(0, next.views - rows[i].views) : null
  }

  if (username) {
    const q = username.toLowerCase()
    rows = rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(q) ||
        r.loginHandle.toLowerCase().includes(q) ||
        (r.tiktokUsername ?? '').toLowerCase().includes(q) ||
        (r.instagramUsername ?? '').toLowerCase().includes(q)
      )
    })
  }

  const history: Record<number, LeagueDayPoint[]> = {}
  const dates: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d)

  const mtdByDay = new Map<string, Map<number, number>>()
  const running = new Map<number, number>()
  for (const id of names.keys()) running.set(id, 0)
  for (const date of dates) {
    for (const id of names.keys()) {
      running.set(id, (running.get(id) ?? 0) + (dailyViews.get(id)?.get(date) ?? 0))
    }
    mtdByDay.set(date, new Map(running))
  }

  for (const id of names.keys()) {
    const points: LeagueDayPoint[] = []
    let prevRank: number | null = null
    for (const date of dates) {
      const ranks = ranksFromTotals(mtdByDay.get(date)!, names)
      const rank = ranks.get(id) ?? names.size
      const views = mtdByDay.get(date)?.get(id) ?? 0
      points.push({
        date,
        rank,
        views,
        delta: prevRank == null ? null : prevRank - rank,
      })
      prevRank = rank
    }
    history[id] = points
  }

  return { from, to, yesterday, projects, rows, history }
}
