/** Client-safe probation streak copy + shared types (no DB). */

/** First at 3 misses, second at +3 (=6), final at +4 (=10). */
export const PROBATION_LEVEL_THRESHOLDS = { 1: 3, 2: 6, 3: 10 } as const
export type ProbationLevel = 1 | 2 | 3

/** Monthly consistency target: miss ≤10 days ≈ stay ≥67% in a 30-day window. */
export const CONSISTENCY_TARGET_PCT = 67
export const CONSISTENCY_MAX_MISS_DAYS_PER_MONTH = 10

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
    first: number
    second: number
    final: number
    /** Active people still on the list (not fired). Used for Clear all. */
    total: number
  }
}

/** Which streak bucket a row is in from miss days (0 = not on a streak yet). */
export function streakBucketFromMisses(missCount: number): 0 | ProbationLevel {
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[3]) return 3
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[2]) return 2
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[1]) return 1
  return 0
}

export function buildProbationStreakMessage(notice: ProbationNotice): string {
  const days =
    notice.missDates.length > 0
      ? notice.missDates.map((d) => d.slice(5)).join(' و ')
      : notice.unlockedOn.slice(5)

  if (notice.level === 1) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا الستريك الأول (First streak) — بعد 3 أيام بدون نشر.`,
      `لم تنشر في الأيام: ${days}.`,
      `هدفنا: لا تفوّت أكثر من 10 أيام في الشهر، وابقَ التزامك ≥ 67%.`,
      `متبقي لديك ستريكان: الثاني (عند 6 أيام غياب) ثم الأخير (عند 10). بعد الأخير نتوقف عن العمل معك.`,
      `انشر يومياً وارفع الروابط في نفس اليوم من صفحة الرفع — ومنها تتابع نسبة التزامك وأيام الغياب والستريكات.`,
    ].join('\n')
  }
  if (notice.level === 2) {
    return [
      `مرحباً ${notice.name}،`,
      `هذا الستريك الثاني (Second streak) — بعد 6 أيام بدون نشر.`,
      `الأيام بدون نشر: ${days}.`,
      `متبقي لديك الستريك الأخير فقط (عند 10 أيام غياب) = إيقاف التعاون.`,
      `ابقَ ≥ 67% ولا تفوّت أكثر من 10 أيام في الشهر.`,
      `انشر اليوم وارفع الرابط من صفحة الرفع — هناك ترى التزامك والستريكات وأيام الغياب.`,
    ].join('\n')
  }
  return [
    `مرحباً ${notice.name}،`,
    `هذا الستريك الأخير (Final streak) — بعد 10 أيام بدون نشر.`,
    `بسبب تكرار عدم النشر في الموعد، سنتوقف عن العمل معك اعتباراً من اليوم.`,
    days ? `آخر أيام بدون نشر: ${days}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function streakLabel(level: ProbationLevel | 0): string {
  if (level <= 0) return 'none'
  if (level === 1) return 'first streak'
  if (level === 2) return 'second streak'
  return 'final streak'
}

export function buildCreatorWelcomeMessage(name: string): string {
  return [
    `مرحباً ${name}، أهلاً بك في فريقنا 👋`,
    ``,
    `نظام العمل عندنا بسيط:`,
    `• انشر يومياً وارفع روابط فيديوهاتك في نفس اليوم من صفحة الرفع على الموقع.`,
    `• هدف الالتزام: لا تفوّت أكثر من 10 أيام في الشهر، وابقَ نسبة التزامك ≥ 67%.`,
    `• تحت المراقبة: الستريك الأول بعد 3 أيام غياب، الثاني بعد 6، والأخير بعد 10 — وبعد الأخير نتوقف عن التعاون.`,
    ``,
    `من صفحة رفع الفيديوهات تقدر تشوف في أي وقت:`,
    `• نسبة التزامك`,
    `• كم يوم اشتغلت معنا`,
    `• كم يوم غياب وكم ستريك (إن وُجد)`,
    ``,
    `بالتوفيق — ننتظر نشرك اليوم ✨`,
  ].join('\n')
}

export function buildCreatorConsistencyMessage(opts: {
  name: string
  daysWithUs: number
  windowConsistencyPct: number
  allConsistencyPct: number | null
  missDays: number
  streakLevel: ProbationLevel | 0
  onProbation: boolean
}): string {
  const streak =
    opts.streakLevel <= 0
      ? 'لا يوجد ستريك حالياً'
      : opts.streakLevel === 1
        ? 'الستريك الأول'
        : opts.streakLevel === 2
          ? 'الستريك الثاني'
          : 'الستريك الأخير'
  const allLine =
    opts.allConsistencyPct != null
      ? `• التزام كل العقود: ${opts.allConsistencyPct}%`
      : null
  return [
    `مرحباً ${opts.name}،`,
    ``,
    `هذا ملخص التزامك معنا:`,
    `• مدة العمل معنا: ${opts.daysWithUs} يوم`,
    `• التزام آخر 30 يوم: ${opts.windowConsistencyPct}%`,
    allLine,
    opts.onProbation
      ? `• تحت المراقبة: ${opts.missDays} يوم غياب · ${streak}`
      : `• أيام الغياب (مراقبة): ${opts.missDays} · ${streak}`,
    ``,
    `الهدف: لا تفوّت أكثر من 10 أيام في الشهر، وابقَ ≥ 67% التزام.`,
    `السلّم تحت المراقبة: أول ستريك عند 3 غياب، ثاني عند 6، أخير عند 10.`,
    ``,
    `تابع نسبة التزامك وأيام الغياب والستريكات من صفحة رفع الفيديوهات على الموقع.`,
  ]
    .filter((line): line is string => line != null)
    .join('\n')
}
