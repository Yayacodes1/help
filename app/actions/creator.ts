'use server'

import { after } from 'next/server'
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
import { OPERATIONAL_TZ, operationalDayFromIso } from '@/lib/operational-day'
import { findExistingVideos, resolveVideoKey, videoKeyFromUrl } from '@/lib/video-key'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

// Public gate: verify the TikTok username belongs to a registered creator,
// then unlock the submission form for them.
export async function startSubmission(_prev: unknown, formData: FormData) {
  const platform = parseLoginPlatform(formData.get('login_platform'))
  const username = normalizeHandle((formData.get('username') ?? '').toString())
  if (!platform) {
    return { ok: false, message: 'اختر إنستقرام أو تيك توك.' }
  }
  if (!username) {
    return { ok: false, message: 'أدخل اسم المستخدم.' }
  }
  let creator = await getCreatorByLoginHandle(platform, username)
  let loginPlatform = platform
  if (!creator) {
    const other = platform === 'instagram' ? 'tiktok' : 'instagram'
    creator = await getCreatorByLoginHandle(other, username)
    if (creator) loginPlatform = other
  }
  if (!creator) {
    creator = await getCreatorByName(username)
  }
  if (!creator) {
    return { ok: false, message: 'اسم المستخدم غير مسجّل على هذا الحساب. تواصل مع الإدارة لإضافتك.' }
  }
  try {
    await sql`
      UPDATE creators
      SET login_platform = ${loginPlatform}
      WHERE id = ${creator.id}
    `
  } catch {
    /* still let them in if the login-platform write fails */
  }
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
        message: `لم نتعرف على الروابط. Could not recognize ${rejected.length} link(s). Use Instagram or TikTok video links only:\n${rejected
          .map((r) => `• ${r.url}`)
          .join('\n')}`,
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
  const ownPriorDays = [
    ...new Set(
      keyed
        .map((r) => (r.key ? existing.get(r.key) : undefined))
        .filter((p) => p && p.creator_id === creator.id)
        .map((p) => p!.video_date),
    ),
  ]
  const ownHint =
    ownPriorDays.length > 0
      ? `\n\n💡 فيديوهاتك محفوظة ليوم ${ownPriorDays.join('، ')} — اختره من «اختر اليوم» لتراها. Your videos are saved for ${ownPriorDays.join(', ')} — pick that day below to see them.`
      : ''
  const blockedNote =
    blocked.length > 0
      ? `\n\n⛔ هذا الرابط تم إرساله من قبل ولن يُحسب. Already submitted — not added (${blocked.length}):\n${blocked.join('\n')}${ownHint}`
      : ''
  if (fresh.length === 0) {
    return { ok: false, message: `لم تتم إضافة أي فيديو. Nothing was added.${blockedNote}` }
  }

  const inserted: Array<{ id: number; platform: (typeof fresh)[number]['platform']; url: string }> =
    []
  for (const row of fresh) {
    const finalUrl = row.resolvedUrl || row.url
    const saved = (await sql`
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
        0,
        NULL,
        NULL,
        ${row.key ?? videoKeyFromUrl(finalUrl)}
      )
      RETURNING id
    `) as { id: number }[]
    if (saved[0]) {
      inserted.push({ id: saved[0].id, platform: row.platform, url: finalUrl })
    }
  }

  if (inserted.length > 0 && process.env.TIKHUB_API_KEY?.trim()) {
    after(() => {
      void import('@/lib/refresh-views').then(({ hydrateSubmissionViews }) =>
        hydrateSubmissionViews(inserted),
      )
    })
  }

  revalidatePath('/submit')
  revalidatePath('/admin')
  revalidatePath('/leader', 'layout')
  const skipped =
    rejected.length > 0
      ? `\n\n⚠️ لم نتعرف على هذه الروابط ولم تُحسب. Skipped ${rejected.length} link(s) that are not Instagram/TikTok videos:\n${rejected
          .map((r) => `• ${r.url}`)
          .join('\n')}`
      : ''
  const ig = fresh.filter((r) => r.platform === 'instagram').length
  const tt = fresh.filter((r) => r.platform === 'tiktok').length
  const when = `${videoDate} ${postTime.slice(0, 5)}`
  return {
    ok: true,
    message: `✅ تم حفظ ${fresh.length} فيديو ليوم ${when}. Added ${fresh.length} video${fresh.length > 1 ? 's' : ''} to ${projectName} for ${when} (IG ${ig} · TT ${tt}).${skipped}${blockedNote}`,
    blocked: blocked.length,
    videoDate,
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
  revalidatePath('/leader', 'layout')
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
  revalidatePath('/leader', 'layout')
}
