'use server'

import { sql } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'
import { revalidatePath } from 'next/cache'
import { getSheetDayVideos, type SheetDayVideo } from '@/lib/analytics'
import { syncRevenueCatDownloads } from '@/lib/revenuecat'

export type DownloadEntry = { date: string; downloads: number | null }

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

/**
 * Upsert daily app downloads for one project; null clears that day.
 * `manual` = typed by hand (RevenueCat sync never overwrites these); `import` = CSV upload.
 */
export async function saveDailyDownloads(
  projectId: number,
  entries: DownloadEntry[],
  source: 'manual' | 'import' = 'manual',
) {
  await requireAdmin()
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return { ok: false as const, error: 'Pick a project first.' }
  }

  let saved = 0
  for (const entry of entries.slice(0, 2000)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue
    if (entry.downloads == null) {
      await sql`
        DELETE FROM daily_downloads
        WHERE day = ${entry.date}::date AND project_id = ${projectId}
      `
    } else {
      const n = Math.max(0, Math.round(Number(entry.downloads)))
      if (!Number.isFinite(n)) continue
      await sql`
        INSERT INTO daily_downloads (day, project_id, downloads, source, updated_at)
        VALUES (${entry.date}::date, ${projectId}, ${n}, ${source}, NOW())
        ON CONFLICT (day, project_id)
        DO UPDATE SET downloads = EXCLUDED.downloads, source = EXCLUDED.source, updated_at = NOW()
      `
    }
    saved++
  }

  revalidatePath('/admin')
  return { ok: true as const, saved }
}

export async function loadSheetDay(day: string, projectId: number | null): Promise<SheetDayVideo[]> {
  await requireAdmin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return []
  return getSheetDayVideos({ day, projectId })
}

export async function syncRevenueCatNow(from: string, to: string, projectId: number | null) {
  await requireAdmin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false as const, error: 'Bad date range.' }
  }
  const results = await syncRevenueCatDownloads({ from, to, projectId })
  if (results.length === 0) {
    return { ok: false as const, error: 'RevenueCat is not connected for this project yet.' }
  }
  revalidatePath('/admin')
  const errors = results.filter((r) => r.error).map((r) => `${r.appName}: ${r.error}`)
  const days = results.reduce((s, r) => s + r.days, 0)
  return errors.length > 0
    ? { ok: false as const, error: errors.join(' · ') }
    : { ok: true as const, days }
}
