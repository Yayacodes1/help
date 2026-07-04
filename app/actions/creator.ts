'use server'

import { sql, PLATFORMS, type Platform } from '@/lib/db'
import { getCreatorByToken } from '@/lib/queries'
import { revalidatePath } from 'next/cache'

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

export async function submitVideos(token: string, _prev: unknown, formData: FormData) {
  const creator = await getCreatorByToken(token)
  if (!creator) return { ok: false, message: 'Invalid creator link.' }

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

  revalidatePath(`/submit/${token}`)
  revalidatePath(`/c/${token}`)
  return { ok: true, message: `Added ${rows.length} video${rows.length > 1 ? 's' : ''}.` }
}

export async function deleteOwnSubmission(token: string, submissionId: number) {
  const creator = await getCreatorByToken(token)
  if (!creator) return
  await sql`
    DELETE FROM submissions
    WHERE id = ${submissionId} AND creator_id = ${creator.id}
  `
  revalidatePath(`/submit/${token}`)
  revalidatePath(`/c/${token}`)
}
