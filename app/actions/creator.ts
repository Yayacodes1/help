'use server'

import { sql } from '@/lib/db'
import { getCreatorByLoginHandle, getCreatorByName } from '@/lib/queries'
import { classifyMediaLinks, detectPlatformFromUrl, normalizeMediaUrl } from '@/lib/media-url'
import type { Platform } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normalizeHandle, parseLoginPlatform } from '@/lib/usernames'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import { operationalDayFromIso } from '@/lib/operational-day'

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
  await ensureCreatorTrackingColumns()
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

  type PendingInsert = {
    platform: Platform
    url: string
    batchId: string | null
    batchIndex: number | null
  }
  const pending: PendingInsert[] = rows.map((row) => ({
    ...row,
    batchId: null,
    batchIndex: null,
  }))

  for (let i = 0; i < 40; i++) {
    const igRaw = (formData.get(`batch_ig_${i}`) ?? '').toString().trim()
    const ttRaw = (formData.get(`batch_tt_${i}`) ?? '').toString().trim()
    if (!igRaw && !ttRaw) continue
    const batchId = crypto.randomUUID()
    const batchIndex = i + 1
    for (const [raw, expected] of [
      [igRaw, 'instagram'],
      [ttRaw, 'tiktok'],
    ] as const) {
      if (!raw) continue
      const url = normalizeMediaUrl(raw)
      if (!url) {
        return { ok: false, message: `Batch ${batchIndex}: that link is not a URL.` }
      }
      const platform = detectPlatformFromUrl(url)
      if (!platform) {
        return {
          ok: false,
          message: `Batch ${batchIndex}: use an Instagram or TikTok link.`,
        }
      }
      if (platform !== expected) {
        return {
          ok: false,
          message: `Batch ${batchIndex}: put the ${expected === 'instagram' ? 'Instagram' : 'TikTok'} link in the ${expected === 'instagram' ? 'Instagram' : 'TikTok'} field.`,
        }
      }
      pending.push({ platform, url, batchId, batchIndex })
    }
  }

  if (pending.length === 0) {
    if (rejected.length > 0) {
      return {
        ok: false,
        message: `Could not recognize ${rejected.length} link(s). Use Instagram or TikTok URLs only.`,
      }
    }
    return { ok: false, message: 'Paste at least one Instagram or TikTok video link.' }
  }

  const videoDateFallback =
    creator.role === 'reposter'
      ? operationalDayFromIso(new Date().toISOString())
      : null

  for (const row of pending) {
    let views = 0
    let viewsError: string | null = null
    let platformPostedAt: string | null = null
    let videoDate = videoDateFallback
    let finalUrl = row.url

    if (process.env.TIKHUB_API_KEY?.trim()) {
      try {
        const { fetchViewsDetailed } = await import('@/lib/tikhub')
        const { videoDateFromPostedAt } = await import('@/lib/submission-meta')
        const result = await fetchViewsDetailed(row.platform, row.url)
        if (result.ok) {
          views = result.views
          if (result.resolvedUrl) finalUrl = result.resolvedUrl
          if (result.postedAt) {
            platformPostedAt = result.postedAt
            if (creator.role !== 'reposter') {
              videoDate = videoDateFromPostedAt(result.postedAt)
            }
          }
        } else {
          viewsError = result.reason.slice(0, 400)
        }
      } catch (e) {
        viewsError =
          e instanceof Error ? e.message.slice(0, 400) : 'views fetch failed'
      }
    }

    await sql`
      INSERT INTO submissions (
        creator_id, project_id, platform, url, video_date, created_at,
        batch_id, batch_index, views, views_error, platform_posted_at
      )
      VALUES (
        ${creator.id},
        ${projectId},
        ${row.platform},
        ${finalUrl},
        COALESCE(${videoDate}::date, CURRENT_DATE),
        NOW(),
        ${row.batchId},
        ${row.batchIndex},
        ${views},
        ${viewsError},
        ${platformPostedAt}::timestamptz
      )
    `
  }

  revalidatePath('/submit')
  revalidatePath('/admin')
  const skipped =
    rejected.length > 0 ? ` Skipped ${rejected.length} unrecognized link(s).` : ''
  const ig = pending.filter((r) => r.platform === 'instagram').length
  const tt = pending.filter((r) => r.platform === 'tiktok').length
  const batches = new Set(pending.map((r) => r.batchId).filter(Boolean)).size
  const batchNote = batches > 0 ? ` · ${batches} batch${batches > 1 ? 'es' : ''}` : ''
  return {
    ok: true,
    message: `Added ${pending.length} video${pending.length > 1 ? 's' : ''} (IG ${ig} · TT ${tt}${batchNote}).${skipped}`,
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
