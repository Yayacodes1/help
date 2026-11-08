/** Client-safe streak copy + shared types (no DB). */

/**
 * Consecutive miss days (from Nov 7 epoch):
 * 1 → first verbal · 2 → second verbal · 3 → final (fire when sent).
 */
export const PROBATION_LEVEL_THRESHOLDS = { 1: 1, 2: 2, 3: 3 } as const
export type ProbationLevel = 1 | 2 | 3

/** Streak counting starts on this day (inclusive). */
export const STREAK_EPOCH_START = '2026-11-07'

/** Monthly consistency target (shown in creator messages). */
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

/** How this person looks on the selected calendar day. */
export type DayPostStatus = 'posted' | 'missed' | 'break' | 'off'

export type ProbationStreakRow = {
  creatorId: number
  name: string
  projectId: number | null
  projectName: string | null
  probationStartedOn: string
  /** Consecutive miss days ending at last completed day. */
  missCount: number
  /** Consecutive miss dates (newest streak run). */
  missDates: string[]
  /** Every miss day since the epoch (for the calendar chips). */
  allMissDates: string[]
  /** 0 = clean, else current streak ladder step. */
  streakLevel: 0 | ProbationLevel
  nextThreshold: number | null
  missesToNext: number | null
  phase: ProbationStreakPhase
  pendingNoticeId: number | null
  pendingLevel: ProbationLevel | null
  lastMessagedLevel: ProbationLevel | null
  paused: boolean
  /** Status on the selected board day. */
  dayStatus: DayPostStatus
  /** @deprecated use dayStatus === 'missed' */
  missedToday: boolean
}

export type ProbationStreakBoard = {
  today: string
  /** Day the board is focused on (epoch ≤ day ≤ today). */
  selectedDay: string
  epochStart: string
  /** Days you can pick, epoch → today. */
  dayOptions: string[]
  projectId: number | null
  rows: ProbationStreakRow[]
  missedToday: Array<{
    creatorId: number
    name: string
    projectName: string | null
  }>
  counts: {
    first: number
    second: number
    final: number
    /** Active people still on the list (not fired). Used for Clear all. */
    total: number
    missedToday: number
    postedOnDay: number
    missedOnDay: number
    breakOnDay: number
  }
}

/** Which streak bucket from consecutive miss days (0 = clean). */
export function streakBucketFromMisses(missCount: number): 0 | ProbationLevel {
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[3]) return 3
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[2]) return 2
  if (missCount >= PROBATION_LEVEL_THRESHOLDS[1]) return 1
  return 0
}

const LEVELS_EXPLAIN = [
  `نظام الستريكات (3 أيام):`,
  `١) الستريك الأول — تنبيه شفهي بعد يوم غياب واحد.`,
  `٢) الستريك الثاني — تنبيه شفهي بعد يومين غياب متتاليين.`,
  `٣) الستريك الأخير — بعد 3 أيام غياب متتالية نتوقف عن العمل معك.`,
].join('\n')

export function buildProbationStreakMessage(notice: ProbationNotice): string {
  const days =
    notice.missDates.length > 0
      ? notice.missDates.map((d) => d.slice(5)).join(' و ')
      : notice.unlockedOn.slice(5)

  if (notice.level === 1) {
    return [
      `مرحباً ${notice.name}،`,
      ``,
      `هذا الستريك الأول (First streak) — تنبيه شفهي بعد يوم واحد بدون نشر.`,
      days ? `يوم الغياب: ${days}.` : '',
      ``,
      LEVELS_EXPLAIN,
      ``,
      `انشر اليوم وارفع الرابط من صفحة الرفع — ومنها تتابع التزامك والستريكات.`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (notice.level === 2) {
    return [
      `مرحباً ${notice.name}،`,
      ``,
      `هذا الستريك الثاني (Second streak) — تنبيه شفهي بعد يومين غياب متتاليين.`,
      days ? `أيام الغياب: ${days}.` : '',
      ``,
      LEVELS_EXPLAIN,
      ``,
      `غداً إذا لم تنشر يصل الستريك الأخير. انشر اليوم من صفحة الرفع.`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `مرحباً ${notice.name}،`,
    ``,
    `هذا الستريك الأخير (Final streak) — بعد 3 أيام غياب متتالية.`,
    `بسبب تكرار عدم النشر، سنتوقف عن العمل معك اعتباراً من اليوم.`,
    days ? `أيام الغياب: ${days}.` : '',
    ``,
    LEVELS_EXPLAIN,
  ]
    .filter(Boolean)
    .join('\n')
}

export function streakLabel(level: ProbationLevel | 0): string {
  if (level <= 0) return 'none'
  if (level === 1) return 'first streak (verbal)'
  if (level === 2) return 'second streak (verbal)'
  return 'final streak'
}

export function buildCreatorWelcomeMessage(name: string): string {
  return [
    `مرحباً ${name}، أهلاً بك في فريقنا 👋`,
    ``,
    `نظام العمل عندنا بسيط:`,
    `• انشر يومياً وارفع روابط فيديوهاتك في نفس اليوم من صفحة الرفع على الموقع.`,
    `• هدف الالتزام: لا تفوّت أكثر من 10 أيام في الشهر، وابقَ نسبة التزامك ≥ 67%.`,
    ``,
    LEVELS_EXPLAIN,
    ``,
    `من صفحة رفع الفيديوهات تقدر تشوف التزامك وأيام الغياب والستريكات.`,
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
        ? 'الستريك الأول (شفهي)'
        : opts.streakLevel === 2
          ? 'الستريك الثاني (شفهي)'
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
    `• أيام الغياب المتتالية: ${opts.missDays} · ${streak}`,
    ``,
    LEVELS_EXPLAIN,
    ``,
    `الهدف الشهري: لا تفوّت أكثر من 10 أيام، وابقَ ≥ 67% التزام.`,
    `تابع من صفحة رفع الفيديوهات على الموقع.`,
  ]
    .filter((line): line is string => line != null)
    .join('\n')
}
