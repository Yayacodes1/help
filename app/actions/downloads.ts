'use server'

import { sql } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'
import { revalidatePath } from 'next/cache'

export type DownloadEntry = { date: string; downloads: number | null }

/** Upsert daily app downloads for one project; null clears that day. */
export async function saveDailyDownloads(projectId: number, entries: DownloadEntry[]) {
  if (!(await isAdmin())) throw new Error('Unauthorized')
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return { ok: false as const, error: 'Pick a project first.' }
  }

  let saved = 0
  for (const entry of entries.slice(0, 1000)) {
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
        INSERT INTO daily_downloads (day, project_id, downloads, updated_at)
        VALUES (${entry.date}::date, ${projectId}, ${n}, NOW())
        ON CONFLICT (day, project_id)
        DO UPDATE SET downloads = EXCLUDED.downloads, updated_at = NOW()
      `
    }
    saved++
  }

  revalidatePath('/admin')
  return { ok: true as const, saved }
}
