import type { AttendanceStatus } from '@/lib/attendance-types'

export type TimedPost = { platform: string; submitDay: string }

/** Hit after midnight Riyadh for that posting day → late. */
export function withLateStatus(
  status: AttendanceStatus,
  day: string,
  goalIg: number,
  goalTt: number,
  posts: TimedPost[],
): AttendanceStatus {
  if (status !== 'hit') return status
  let ig = 0
  let tt = 0
  const needIg = goalIg > 0
  const needTt = goalTt > 0
  if (!needIg && !needTt) {
    const last = posts[posts.length - 1]
    return last && last.submitDay > day ? 'late' : 'hit'
  }
  for (const post of posts) {
    if (post.platform === 'instagram') ig++
    else if (post.platform === 'tiktok') tt++
    const igOk = !needIg || ig >= goalIg
    const ttOk = !needTt || tt >= goalTt
    if (igOk && ttOk) return post.submitDay > day ? 'late' : 'hit'
  }
  return 'hit'
}
