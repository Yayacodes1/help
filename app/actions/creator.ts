'use server'

import { sql } from '@/lib/db'
import { getCreatorByLoginHandle, getCreatorByName } from '@/lib/queries'
import { classifyMediaLinks } from '@/lib/media-url'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normalizeHandle, parseLoginPlatform } from '@/lib/usernames'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import { operationalDayFromIso } from '@/lib/operational-day'

async function fillViewsForNewSubmission(
  id: number,
  platform: 'instagram' | 'tiktok',
  url: string,
) {
  if (!process.env.TIKHUB_API_KEY?.trim()) return
  try {
    const { fetchViewsDetailed } = await import('@/lib/tikhub')
    const result = await fetchViewsDetailed(platform, url)
    if (result.ok) {
      await sql`
        UPDATE submissions
        SET views = ${result.views}, views_error = NULL
        WHERE id = ${id}
      `
    } else {
      await sql`
        UPDATE submissions
        SET views_error = ${result.reason.slice(0, 400)}
        WHERE id = ${id}
      `
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 400) : 'views fetch failed'
    await sql`UPDATE submissions SET views_error = ${msg} WHERE id = ${id}`
  }
}

// Public gate: verify the TikTok username belongs to a registered creator,
// then unlock the submission form for them.
export async function startSubmission(_prev: unknown, formData: FormData) {
  await ensureCreatorTrackingColumns()
  const platform = parseLoginPlatform(formData.get('login_platform'))
  const username = normalizeHandle((formData.get('username') ?? '').toString())
  if (!platform) {
    return { ok: false, message: 'اختر إنستقرام أو تيك توك.' }
  }
  if (!username) {
    return { ok: false, message: 'أدخل اسم المستخدم.' }
  }
  const creator = await getCreatorByLoginHandle(platform, username)
  if (!creator) {
    return { ok: false, message: 'اسم المستخدم غير مسجّل على هذا الحساب. تواصل مع الإدارة لإضافتك.' }
  }
  await sql`
    UPDATE creators
    SET login_platform = ${platform}
    WHERE id = ${creator.id}
  `
  redirect(`/submit?u=${encodeURIComponent(username)}`)
}

export async function submitVideos(username: string, _prev: unknown, formData: FormData) {
  const creator = await getCreatorByName(username)
  if (!creator) return { ok: false, message: 'اسم المستخدم غير مسجّل.' }

  const projectRaw = (formData.get('project_id') ?? '').toString()
  const projectId = projectRaw ? Number(projectRaw) : NaN
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return { ok: false, message: 'Choose Notek or Miqat before posting.' }
  }
  const projects = (await sql`SELECT id FROM projects WHERE id = ${projectId} LIMIT 1`) as { id: number }[]
  if (!projects[0]) return { ok: false, message: 'That project is not available.' }

  // Prefer unified "links" field; fall back to legacy per-platform fields.
  const unified = (formData.get('links') ?? '').toString()
  const legacy = [
    (formData.get('instagram_links') ?? '').toString(),
    (formData.get('tiktok_links') ?? '').toString(),
  ]
    .filter(Boolean)
    .join('\n')

  const { rows, rejected } = classifyMediaLinks(unified || legacy)

  if (rows.length === 0) {
    if (rejected.length > 0) {
      return {
        ok: false,
        message: `Could not recognize ${rejected.length} link(s). Use Instagram or TikTok URLs only.`,
      }
    }
    return { ok: false, message: 'Paste at least one Instagram or TikTok video link.' }
  }

  const videoDate =
    creator.role === 'reposter'
      ? operationalDayFromIso(new Date().toISOString())
      : null

  for (const row of rows) {
    const inserted = (await sql`
      INSERT INTO submissions (creator_id, project_id, platform, url, video_date, created_at)
      VALUES (
        ${creator.id},
        ${projectId},
        ${row.platform},
        ${row.url},
        COALESCE(${videoDate}::date, CURRENT_DATE),
        NOW()
      )
      RETURNING id
    `) as { id: number }[]
    const id = inserted[0]?.id
    if (id != null) {
      await fillViewsForNewSubmission(id, row.platform, row.url)
    }
  }

  revalidatePath('/submit')
  revalidatePath('/admin')
  const skipped =
    rejected.length > 0 ? ` Skipped ${rejected.length} unrecognized link(s).` : ''
  const ig = rows.filter((r) => r.platform === 'instagram').length
  const tt = rows.filter((r) => r.platform === 'tiktok').length
  return {
    ok: true,
    message: `Added ${rows.length} video${rows.length > 1 ? 's' : ''} (IG ${ig} · TT ${tt}).${skipped}`,
  }
}

export async function deleteOwnSubmission(username: string, submissionId: number) {
  const creator = await getCreatorByName(normalizeHandle(username))
  if (!creator) return
  await sql`
    DELETE FROM submissions
    WHERE id = ${submissionId} AND creator_id = ${creator.id}
  `
  revalidatePath('/submit')
}
