'use server'

import { sql, PLATFORMS, type Platform } from '@/lib/db'
import { getCreatorByName } from '@/lib/queries'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '')
}

function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return `https://${value}`
  return value
}

function parseLinks(value: FormDataEntryValue | null): string[] {
  return (value ?? '')
    .toString()
    .split(/[\n,\s]+/)
    .map((l) => normalizeUrl(l))
    .filter((l): l is string => Boolean(l))
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
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

  const byPlatform: Record<Platform, string[]> = {
    instagram: parseLinks(formData.get('instagram_links')),
    tiktok: parseLinks(formData.get('tiktok_links')),
  }

  const rows: { platform: Platform; url: string }[] = []
  for (const platform of PLATFORMS) {
    for (const url of byPlatform[platform]) {
      rows.push({ platform, url })
    }
  }

  if (rows.length === 0) {
    return { ok: false, message: 'Paste at least one video link.' }
  }

  for (const row of rows) {
    await sql`
      INSERT INTO submissions (creator_id, project_id, platform, url, video_date)
      VALUES (${creator.id}, ${creator.project_id}, ${row.platform}, ${row.url}, ${videoDate})
    `
  }

  revalidatePath('/submit')
  return { ok: true, message: `Added ${rows.length} video${rows.length > 1 ? 's' : ''}.` }
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
