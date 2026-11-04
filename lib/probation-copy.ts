/** Client-safe probation streak copy + shared types (no DB). */

export const PROBATION_LEVEL_THRESHOLDS = { 1: 2, 2: 4, 3: 5 } as const
export type ProbationLevel = 1 | 2 | 3

export type ProbationNotice = {
  id: number
  creatorId: number
  name: string
  level: ProbationLevel
  unlockedOn: string
  missDates: string[]
  messagedAt: string | null
  missCount: number
}

export type ProbationStreakPhase =
  | 'clean'
  | 'near_verbal1'
  | 'due_verbal1'
  | 'near_verbal2'
  | 'due_verbal2'
  | 'near_kick'
  | 'due_kick'
  | 'paused'

export type ProbationStreakRow = {
  creatorId: number
  name: string
  projectId: number | null
  projectName: string | null
  probationStartedOn: string
  missCount: number
  missDates: string[]
  nextThreshold: number | null
  missesToNext: number | null
  phase: ProbationStreakPhase
  pendingNoticeId: number | null
  pendingLevel: ProbationLevel | null
  lastMessagedLevel: ProbationLevel | null
  paused: boolean
}

export type ProbationStreakBoard = {
  today: string
  projectId: number | null
  rows: ProbationStreakRow[]
  counts: {
    onProbation: number
    approaching: number
    due: number
    paused: number
  }
}

export function buildProbationStreakMessage(notice: ProbationNotice): string {
  const days =
    notice.missDates.length > 0
      ? notice.missDates.map((d) => d.slice(5)).join(' و ')
      : notice.unlockedOn.slice(5)

  if (notice.level === 1) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا الستريك الأول (First streak).`,
      `لم تنشر في الأيام: ${days}.`,
      `متبقي لديك ستريكان: الثاني ثم الستريك الأخير. بعد الستريك الأخير سنتوقف عن العمل معك.`,
      `يرجى الالتزام بالنشر يومياً ورفع الروابط في نفس اليوم على الموقع.`,
    ].join('\n')
  }
  if (notice.level === 2) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا الستريك الثاني (Second streak).`,
      `الأيام بدون نشر: ${days}.`,
      `متبقي لديك الستريك الأخير فقط. الستريك الأخير = إيقاف التعاون.`,
      `انشر اليوم وارفع الرابط على الموقع فوراً.`,
    ].join('\n')
  }
  return [
    `مرحباً ${notice.name}،`,
    `هذا الستريك الأخير (Final streak).`,
    `بسبب تكرار عدم النشر في الموعد، سنتوقف عن العمل معك اعتباراً من اليوم.`,
    days ? `آخر أيام بدون نشر: ${days}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
