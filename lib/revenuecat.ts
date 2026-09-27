import 'server-only'
import { sql } from '@/lib/db'

const API = 'https://api.revenuecat.com/v2'

export type RevenueCatLink = {
  /** Our project name (e.g. Notek / Miqat). */
  appName: string
  rcProjectId: string
  apiKey: string
}

/**
 * REVENUECAT_PROJECTS="Notek:proj1ab2c3d4,Miqat:proj5ef6g7h8"
 * Key per app: REVENUECAT_API_KEY_NOTEK, falling back to REVENUECAT_API_KEY.
 */
export function revenueCatLinks(): RevenueCatLink[] {
  const raw = process.env.REVENUECAT_PROJECTS?.trim()
  if (!raw) return []
  const out: RevenueCatLink[] = []
  for (const part of raw.split(',')) {
    const [appName, rcProjectId] = part.split(':').map((s) => s?.trim())
    if (!appName || !rcProjectId) continue
    const envKey = `REVENUECAT_API_KEY_${appName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    const apiKey = process.env[envKey]?.trim() || process.env.REVENUECAT_API_KEY?.trim()
    if (!apiKey) continue
    out.push({ appName, rcProjectId, apiKey })
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

/** Chart `values` come back as `[ts, value, …]` arrays or `{cohort|timestamp|date, value, measure?}` objects. */
function parseValues(values: unknown): Map<string, number> {
  const out = new Map<string, number>()
  if (!Array.isArray(values)) return out
  for (const v of values) {
    let day: string | null = null
    let n: number | null = null
    if (Array.isArray(v)) {
      day = toDay(v[0])
      n = typeof v[1] === 'number' ? v[1] : null
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.measure === 'number' && o.measure !== 0) continue
      day = toDay(o.cohort ?? o.timestamp ?? o.date ?? o.period)
      n = typeof o.value === 'number' ? o.value : null
    }
    if (day && n != null) out.set(day, (out.get(day) ?? 0) + Math.round(n))
  }
  return out
}

async function rcGet(link: RevenueCatLink, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API}/projects/${link.rcProjectId}${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${link.apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const msg = (body?.message as string) || `HTTP ${res.status}`
    throw new Error(`RevenueCat ${link.appName}: ${msg}`)
  }
  return body ?? {}
}

async function dayResolutionId(link: RevenueCatLink): Promise<string> {
  try {
    const opts = await rcGet(link, '/charts/customers_new/options', {})
    const list = (opts.resolutions as Array<{ id: string; display_name: string }>) ?? []
    return list.find((r) => r.display_name?.toLowerCase() === 'day')?.id ?? '0'
  } catch {
    return '0'
  }
}

/** Daily "New customers" (first-time app users) — our downloads proxy. */
export async function fetchNewCustomers(
  link: RevenueCatLink,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const resolution = await dayResolutionId(link)
  const data = await rcGet(link, '/charts/customers_new', {
    resolution,
    start_date: from,
    end_date: to,
  })
  return parseValues(data.values)
}

export type RevenueCatSyncResult = {
  appName: string
  projectId: number | null
  days: number
  error?: string
}

/** Pull RevenueCat new customers into daily_downloads; hand-typed days are never overwritten. */
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
    const project = projects.find((p) => p.name.trim().toLowerCase() === link.appName.toLowerCase())
    if (!project) {
      results.push({ appName: link.appName, projectId: null, days: 0, error: 'No matching project' })
      continue
    }
    if (opts.projectId != null && opts.projectId !== project.id) continue
    try {
      const byDay = await fetchNewCustomers(link, opts.from, opts.to)
      let days = 0
      for (const [day, downloads] of byDay) {
        if (day < opts.from || day > opts.to) continue
        await sql`
          INSERT INTO daily_downloads (day, project_id, downloads, source, updated_at)
          VALUES (${day}::date, ${project.id}, ${downloads}, 'revenuecat', NOW())
          ON CONFLICT (day, project_id) DO UPDATE
          SET downloads = EXCLUDED.downloads, source = 'revenuecat', updated_at = NOW()
          WHERE daily_downloads.source <> 'manual'
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
