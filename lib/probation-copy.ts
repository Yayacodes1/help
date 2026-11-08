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
  `نظام الستريكات عندنا (3 أيام):`,
  `١) الستريك الأول — تنبيه لطيف بعد يوم غياب واحد.`,
  `٢) الستريك الثاني — تنبيه ثاني بعد يومين غياب متتاليين.`,
  `٣) الستريك الأخير — بعد 3 أيام غياب متتالية نتوقف عن العمل معك.`,
].join('\n')

const HOW_TO_STAY_CLEAR = [
  `عشان ما توصلك هالرسالة مرة ثانية، تأكد من هالأشياء:`,
  `• انشر في الأيام المحددة لك حسب جدولك.`,
  `• انشر العدد المطلوب من الفيديوهات في ذلك اليوم.`,
  `• ارفع الروابط في نفس اليوم من صفحة الرفع على الموقع — النشر بدون رفع ما يحسب.`,
].join('\n')

const HELP_LINE =
  `إذا عندك أي سؤال، أو تحس إنك تحتاج مساعدة أو دعم منّا، تواصل معنا ونساعدك بكل سرور ❤️`

export function buildProbationStreakMessage(notice: ProbationNotice): string {
  const days =
    notice.missDates.length > 0
      ? notice.missDates.map((d) => d.slice(5)).join(' و ')
      : notice.unlockedOn.slice(5)

  if (notice.level === 1) {
    return [
      `مرحباً ${notice.name} 👋`,
      ``,
      `نرسل لك هالرسالة بلطف — هذا الستريك الأول (First streak): تنبيه شفهي بعد يوم واحد بدون نشر.`,
      days ? `يوم الغياب: ${days}.` : '',
      ``,
      `نتمنى ما يتكرر، ونثق فيك إنك تكمّل معانا بشكل منتظم ✨`,
      ``,
      HOW_TO_STAY_CLEAR,
      ``,
      LEVELS_EXPLAIN,
      ``,
      `انشر اليوم وارفع الروابط من صفحة الرفع — ومنها تتابع التزامك والستريكات.`,
      ``,
      HELP_LINE,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (notice.level === 2) {
    return [
      `مرحباً ${notice.name} 👋`,
      ``,
      `هذا الستريك الثاني (Second streak) — تنبيه شفهي بعد يومين غياب متتاليين.`,
      days ? `أيام الغياب: ${days}.` : '',
      ``,
      `ما زلنا معاك، ونبغى نساعدك ترجع على المسار قبل ما نصل للستريك الأخير.`,
      `رجاءً تأكد إن هذا ما يتكرر.`,
      ``,
      HOW_TO_STAY_CLEAR,
      ``,
      LEVELS_EXPLAIN,
      ``,
      `انشر اليوم وارفع الروابط من صفحة الرفع حتى لا يصل الستريك الأخير غداً.`,
      ``,
      HELP_LINE,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `مرحباً ${notice.name}،`,
    ``,
    `هذا الستريك الأخير (Final streak) — بعد 3 أيام غياب متتالية.`,
    days ? `أيام الغياب: ${days}.` : '',
    ``,
    `للأسف، بسبب تكرار عدم النشر حسب المطلوب، سنتوقف عن العمل معك اعتباراً من اليوم.`,
    ``,
    LEVELS_EXPLAIN,
    ``,
    `نتمنى لك كل التوفيق، وإذا احتجت توضيحاً تواصل معنا.`,
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
    `سعيدين بوجودك معنا. نظام العمل بسيط وواضح:`,
    `• انشر في الأيام المحددة لك، وبالعدد المطلوب.`,
    `• ارفع روابط فيديوهاتك في نفس يوم النشر من صفحة الرفع على الموقع — النشر بدون رفع ما يحسب.`,
    `• هدف الالتزام: لا تفوّت أكثر من 10 أيام في الشهر، وابقَ نسبة التزامك ≥ 67%.`,
    ``,
    LEVELS_EXPLAIN,
    ``,
    `من صفحة رفع الفيديوهات تقدر تشوف التزامك وأيام الغياب والستريكات.`,
    ``,
    HELP_LINE,
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
    `مرحباً ${opts.name} 👋`,
    ``,
    `هذا ملخص لطيف لالتزامك معنا:`,
    `• مدة العمل معنا: ${opts.daysWithUs} يوم`,
    `• التزام آخر 30 يوم: ${opts.windowConsistencyPct}%`,
    allLine,
    `• أيام الغياب المتتالية: ${opts.missDays} · ${streak}`,
    ``,
    HOW_TO_STAY_CLEAR,
    ``,
    LEVELS_EXPLAIN,
    ``,
    `الهدف الشهري: لا تفوّت أكثر من 10 أيام، وابقَ ≥ 67% التزام.`,
    `تابع من صفحة رفع الفيديوهات على الموقع.`,
    ``,
    HELP_LINE,
  ]
    .filter((line): line is string => line != null)
    .join('\n')
}
