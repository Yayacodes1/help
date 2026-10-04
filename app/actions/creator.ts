'use server'

import { sql } from '@/lib/db'
import {
  getCreatorByLoginHandle,
  getCreatorByName,
  getServerNowIso,
  getServerToday,
} from '@/lib/queries'
import { addDays } from '@/lib/campaign'
import { classifyMediaLinks } from '@/lib/media-url'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normalizeHandle, parseLoginPlatform } from '@/lib/usernames'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import { OPERATIONAL_TZ, operationalDayFromIso } from '@/lib/operational-day'
import { findExistingVideos, resolveVideoKey, videoKeyFromUrl } from '@/lib/video-key'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

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
  const projects = (await sql`SELECT id, name FROM projects WHERE id = ${projectId} LIMIT 1`) as {
    id: number
    name: string
  }[]
  if (!projects[0]) return { ok: false, message: 'That project is not available.' }
  const projectName = projects[0].name

  // Prefer unified "links" field; fall back to legacy per-platform fields.
  const unified = (formData.get('links') ?? '').toString()
  const legacy = [
    (formData.get('instagram_links') ?? '').toString(),
    (formData.get('tiktok_links') ?? '').toString(),
  ]
    .filter(Boolean)
    .join('\n')

  const { rows: pending, rejected } = classifyMediaLinks(unified || legacy)

  if (pending.length === 0) {
    if (rejected.length > 0) {
      return {
        ok: false,
        message: `Could not recognize ${rejected.length} link(s). Use Instagram or TikTok URLs only.`,
      }
    }
    return { ok: false, message: 'Paste at least one Instagram or TikTok video link.' }
  }

  const videoDateRaw = (formData.get('video_date') ?? '').toString().trim()
  const postTimeRaw = (formData.get('post_time') ?? '').toString().trim()
  if (!DATE_RE.test(videoDateRaw)) {
    return { ok: false, message: 'Pick the date you are posting for.' }
  }
  if (!TIME_RE.test(postTimeRaw)) {
    return { ok: false, message: 'Pick the time you posted.' }
  }
  const [calendarToday, serverNow] = await Promise.all([getServerToday(), getServerNowIso()])
  const opToday = operationalDayFromIso(serverNow)
  const allowedDays = new Set([calendarToday, opToday, addDays(calendarToday, -1), addDays(opToday, -1)])
  if (!allowedDays.has(videoDateRaw)) {
    return { ok: false, message: 'يمكنك إضافة فيديوهات اليوم أو الأمس فقط. You can only add videos for today or yesterday.' }
  }
  const videoDate = videoDateRaw
  const postTime = postTimeRaw.length === 5 ? `${postTimeRaw}:00` : postTimeRaw

  // Same video can't be submitted twice (by anyone), however the link is written.
  const keyed = await Promise.all(
    pending.map(async (row) => ({ ...row, ...(await resolveVideoKey(row.url)) })),
  )
  const existing = await findExistingVideos(keyed.map((r) => r.key ?? ''))
  const blocked: string[] = []
  const seenKeys = new Set<string>()
  const fresh: typeof keyed = []
  for (const row of keyed) {
    const prior = row.key ? existing.get(row.key) : undefined
    if (prior) {
      const who = prior.creator_id === creator.id ? 'by you' : 'by another account'
      blocked.push(`• ${row.url} — already submitted ${who} on ${prior.video_date}`)
    } else if (row.key && seenKeys.has(row.key)) {
      blocked.push(`• ${row.url} — same video pasted twice`)
    } else {
      if (row.key) seenKeys.add(row.key)
      fresh.push(row)
    }
  }
  const blockedNote =
    blocked.length > 0
      ? `\n\n⛔ هذا الرابط تم إرساله من قبل ولن يُحسب. Already submitted — not added (${blocked.length}):\n${blocked.join('\n')}`
      : ''
  if (fresh.length === 0) {
    return { ok: false, message: `لم تتم إضافة أي فيديو. Nothing was added.${blockedNote}` }
  }

  for (const row of fresh) {
    let views = 0
    let viewsError: string | null = null
    let platformPostedAt: string | null = null
    let finalUrl = row.url

    if (process.env.TIKHUB_API_KEY?.trim()) {
      try {
        const { fetchViewsDetailed } = await import('@/lib/tikhub')
        const result = await fetchViewsDetailed(row.platform, row.url)
        if (result.ok) {
          views = result.views
          if (result.resolvedUrl) finalUrl = result.resolvedUrl
          if (result.postedAt) platformPostedAt = result.postedAt
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
        views, views_error, platform_posted_at, video_key
      )
      VALUES (
        ${creator.id},
        ${projectId},
        ${row.platform},
        ${finalUrl},
        ${videoDate}::date,
        ((${videoDate}::date + ${postTime}::time) AT TIME ZONE ${OPERATIONAL_TZ}),
        ${views},
        ${viewsError},
        ${platformPostedAt}::timestamptz,
        ${row.key ?? videoKeyFromUrl(finalUrl)}
      )
    `
  }

  revalidatePath('/submit')
  revalidatePath('/admin')
  const skipped =
    rejected.length > 0 ? ` Skipped ${rejected.length} unrecognized link(s).` : ''
  const ig = fresh.filter((r) => r.platform === 'instagram').length
  const tt = fresh.filter((r) => r.platform === 'tiktok').length
  return {
    ok: true,
    message: `Added ${fresh.length} video${fresh.length > 1 ? 's' : ''} to ${projectName} (IG ${ig} · TT ${tt}).${skipped}${blockedNote}`,
    blocked: blocked.length,
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

/** Creators can only move their own videos from today or yesterday. */
export async function updateOwnSubmissionProject(
  username: string,
  submissionId: number,
  projectId: number,
) {
  const creator = await getCreatorByName(normalizeHandle(username))
  if (!creator) return
  const [calendarToday, serverNow] = await Promise.all([getServerToday(), getServerNowIso()])
  const opToday = operationalDayFromIso(serverNow)
  const earliest = [addDays(calendarToday, -1), addDays(opToday, -1)].sort()[0]
  await sql`
    UPDATE submissions
    SET project_id = ${projectId}
    WHERE id = ${submissionId}
      AND creator_id = ${creator.id}
      AND video_date >= ${earliest}::date
      AND EXISTS (SELECT 1 FROM projects WHERE id = ${projectId})
  `
  revalidatePath('/submit')
  revalidatePath('/admin')
}
