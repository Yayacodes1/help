import 'server-only'
import { sql } from '@/lib/db'
import { isMiyqatProjectName, isNotekProjectName } from '@/lib/project-scope'

const API = 'https://api.revenuecat.com/v2'

/** Notek and Miqat in this app. Tafsir stays out of the daily sheet. */
const DEFAULT_PROJECTS = 'Notek:projab826e64,Miqat:proj6e88a0e8'

export type RevenueCatLink = {
  /** Our project name (e.g. Notek / Miqat). */
  appName: string
  rcProjectId: string
  apiKey: string
}

/**
 * REVENUECAT_PROJECTS="Notek:projab826e64,Miqat:proj6e88a0e8"
 * Key: REVENUECAT_API_KEY, or REVENUECAT_API_KEY_NOTEK / _MIQAT per app.
 * When the map is missing, Notek and Miqat use the ids above.
 */
function configuredProjects(): Array<{ appName: string; rcProjectId: string }> {
  const raw = process.env.REVENUECAT_PROJECTS?.trim()
  const out: Array<{ appName: string; rcProjectId: string }> = []
  for (const part of (raw || DEFAULT_PROJECTS).split(',')) {
    const [appName, rcProjectId] = part.split(':').map((s) => s?.trim())
    if (!appName || !rcProjectId) continue
    out.push({ appName, rcProjectId })
  }
  // Always cover Notek and Miqat, even if an older env value only listed one.
  for (const part of DEFAULT_PROJECTS.split(',')) {
    const [appName, rcProjectId] = part.split(':').map((s) => s?.trim())
    if (!appName || !rcProjectId) continue
    if (out.some((p) => matchesApp(p.appName, appName))) continue
    out.push({ appName, rcProjectId })
  }
  return out
}

export function revenueCatLinks(): RevenueCatLink[] {
  const fallbackKey = process.env.REVENUECAT_API_KEY?.trim()
  const out: RevenueCatLink[] = []
  for (const project of configuredProjects()) {
    const envKey = `REVENUECAT_API_KEY_${project.appName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const apiKey = process.env[envKey]?.trim() || fallbackKey
    if (!apiKey) continue
    out.push({ ...project, apiKey })
  }
  return out
}

function toDay(value: unknown): string | null {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    return new Date(ms).toISOString().slice(0, 10)
  }
  return null
}

/** Chart `values` come back as `[ts, count]` arrays. */
function parseDownloads(values: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (!Array.isArray(values)) return out
  for (const v of values) {
    if (!Array.isArray(v)) continue
    const day = toDay(v[0])
    const n = typeof v[1] === 'number' ? Math.round(v[1]) : null
    if (day && n != null) out.set(day, (out.get(day) ?? 0) + n)
  }
  return out
}

export function linkedProjectIds(projects: Array<{ id: number; name: string }>): number[] {
  const ids: number[] = []
  for (const link of configuredProjects()) {
    const project = projects.find((p) => matchesApp(link.appName, p.name))
    if (project && !ids.includes(project.id)) ids.push(project.id)
  }
  return ids
}

function matchesApp(appName: string, projectName: string): boolean {
  if (projectName.trim().toLowerCase() === appName.trim().toLowerCase()) return true
  const app = appName.trim().toLowerCase()
  if (app === 'notek' || app.includes('note')) return isNotekProjectName(projectName) && !isMiyqatProjectName(projectName)
  if (app === 'miqat' || app.includes('miq') || app.includes('miy')) return isMiyqatProjectName(projectName)
  return false
}

async function rcGet(link: RevenueCatLink, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const call = (projectId: string) =>
    fetch(`${API}/projects/${projectId}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${link.apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    })
  let res = await call(link.rcProjectId)
  if (res.status === 404 && !link.rcProjectId.startsWith('proj')) {
    const retry = await call(`proj${link.rcProjectId}`)
    if (retry.ok) {
      link.rcProjectId = `proj${link.rcProjectId}`
      res = retry
    }
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const msg = (body?.message as string) || `HTTP ${res.status}`
    throw new Error(`RevenueCat ${link.appName}: ${msg}`)
  }
  return body ?? {}
}

export type RevenueCatSyncResult = {
  appName: string
  projectId: number | null
  days: number
  error?: string
}

/** Pull RevenueCat new customers into daily_downloads. Hand-typed days stay as typed. */
export async function syncRevenueCatDownloads(opts: {
  from: string
  to: string
  projectId?: number | null
}): Promise<RevenueCatSyncResult[]> {
  const links = revenueCatLinks()
  if (links.length === 0) return []
  const projects = (await sql`SELECT id, name FROM projects`) as { id: number; name: string }[]
  const results: RevenueCatSyncResult[] = []

  for (const link of links) {
    const project = projects.find((p) => matchesApp(link.appName, p.name))
    if (!project) {
      results.push({ appName: link.appName, projectId: null, days: 0, error: 'No matching project' })
      continue
    }
    if (opts.projectId != null && opts.projectId !== project.id) continue
    try {
      const data = await rcGet(link, '/charts/customers_new', {
        resolution: '0',
        start_date: opts.from,
        end_date: opts.to,
      })
      const downloads = parseDownloads(data.values)
      let days = 0
      for (const [day, count] of downloads) {
        if (day < opts.from || day > opts.to) continue
        await sql`
          INSERT INTO daily_downloads (day, project_id, downloads, source, updated_at)
          VALUES (${day}::date, ${project.id}, ${count}, 'revenuecat', NOW())
          ON CONFLICT (day, project_id) DO UPDATE SET
            downloads = CASE WHEN daily_downloads.source = 'manual'
              THEN daily_downloads.downloads ELSE EXCLUDED.downloads END,
            source = CASE WHEN daily_downloads.source = 'manual'
              THEN 'manual' ELSE 'revenuecat' END,
            updated_at = NOW()
        `
        days++
      }
      results.push({ appName: link.appName, projectId: project.id, days })
    } catch (e) {
      results.push({
        appName: link.appName,
        projectId: project.id,
        days: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return results
}
