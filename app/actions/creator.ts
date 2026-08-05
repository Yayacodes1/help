'use server'

import { sql } from '@/lib/db'
import { getCreatorByName } from '@/lib/queries'
import { classifyMediaLinks } from '@/lib/media-url'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '')
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

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
  const username = normalizeUsername((formData.get('username') ?? '').toString())
  if (!username) {
    return { ok: false, message: 'أدخل اسم مستخدم تيك توك.' }
  }
  const creator = await getCreatorByName(username)
  if (!creator) {
    return { ok: false, message: 'اسم المستخدم غير مسجّل. تواصل مع الإدارة لإضافتك.' }
  }
  redirect(`/submit?u=${encodeURIComponent(creator.name)}`)
}

export async function submitVideos(username: string, _prev: unknown, formData: FormData) {
  const creator = await getCreatorByName(username)
  if (!creator) return { ok: false, message: 'اسم المستخدم غير مسجّل.' }

  const dateRaw = (formData.get('video_date') ?? '').toString()
  const videoDate = isValidDate(dateRaw) ? dateRaw : null
  if (!videoDate) return { ok: false, message: 'Please choose a valid date.' }

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

  for (const row of rows) {
    const inserted = (await sql`
      INSERT INTO submissions (creator_id, project_id, platform, url, video_date)
      VALUES (${creator.id}, ${creator.project_id}, ${row.platform}, ${row.url}, ${videoDate})
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
  const creator = await getCreatorByName(username)
  if (!creator) return
  await sql`
    DELETE FROM submissions
    WHERE id = ${submissionId} AND creator_id = ${creator.id}
  `
  revalidatePath('/submit')
}
