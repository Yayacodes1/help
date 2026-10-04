import { addDays } from '@/lib/campaign'

export const SCHEDULE_TYPES = ['daily', 'every_n_days', 'weekdays', 'per_week'] as const
export type ScheduleType = (typeof SCHEDULE_TYPES)[number]

export type PostingSchedule = {
  type: ScheduleType
  /** every_n_days: one posting day every N days, counted from the contract start (2 = every other day). */
  everyDays: number
  /** weekdays: 0 = Sunday … 6 = Saturday. */
  weekdays: number[]
  /** per_week: videos due in each 7-day block counted from the contract start. */
  perWeek: number
}

export type ScheduleColumns = {
  schedule_type?: string | null
  schedule_every_days?: number | null
  schedule_weekdays?: string | null
  schedule_per_week?: number | null
}

export const DAILY_SCHEDULE: PostingSchedule = {
  type: 'daily',
  everyDays: 1,
  weekdays: [],
  perWeek: 0,
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function normalizeScheduleType(value: unknown): ScheduleType {
  return SCHEDULE_TYPES.includes(value as ScheduleType) ? (value as ScheduleType) : 'daily'
}

export function parseWeekdays(value: string | null | undefined): number[] {
  if (!value) return []
  const days = value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return [...new Set(days)].sort((a, b) => a - b)
}

export function scheduleFromContract(
  contract: ScheduleColumns | null | undefined,
): PostingSchedule {
  if (!contract) return DAILY_SCHEDULE
  const type = normalizeScheduleType(contract.schedule_type)
  const everyDays = Math.max(1, Math.floor(Number(contract.schedule_every_days) || 2))
  const weekdays = parseWeekdays(contract.schedule_weekdays)
  const perWeek = Math.max(0, Math.floor(Number(contract.schedule_per_week) || 0))
  if (type === 'every_n_days' && everyDays <= 1) return DAILY_SCHEDULE
  if (type === 'weekdays' && weekdays.length === 0) return DAILY_SCHEDULE
  if (type === 'per_week' && perWeek <= 0) return DAILY_SCHEDULE
  return { type, everyDays, weekdays, perWeek }
}

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
}

export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

/** The 7-day block (from the contract start) that contains `date`. */
export function weekBlock(start: string, date: string): { start: string; end: string } {
  const offset = dayNumber(date) - dayNumber(start)
  const blockStart = addDays(start, Math.floor(offset / 7) * 7)
  return { start: blockStart, end: addDays(blockStart, 6) }
}

/**
 * Whether a single day needs a post on its own.
 * Weekly schedules have no fixed days — they're checked on the last day of each week block.
 */
export function isPostingDay(schedule: PostingSchedule, start: string, date: string): boolean {
  switch (schedule.type) {
    case 'daily':
      return true
    case 'every_n_days': {
      const offset = dayNumber(date) - dayNumber(start)
      return offset >= 0 && offset % schedule.everyDays === 0
    }
    case 'weekdays':
      return schedule.weekdays.includes(weekdayOf(date))
    case 'per_week':
      return false
  }
}

const WEEKDAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const

export function describeSchedule(schedule: PostingSchedule, locale: string = 'en'): string {
  if (locale.startsWith('ar')) {
    switch (schedule.type) {
      case 'daily':
        return 'كل يوم'
      case 'every_n_days':
        return schedule.everyDays === 2 ? 'يوم بعد يوم' : `مرة كل ${schedule.everyDays} أيام`
      case 'weekdays':
        return schedule.weekdays.map((d) => WEEKDAY_AR[d]).join('، ')
      case 'per_week':
        return `${schedule.perWeek} فيديو في الأسبوع`
    }
  }
  switch (schedule.type) {
    case 'daily':
      return 'Every day'
    case 'every_n_days':
      return schedule.everyDays === 2
        ? 'Every other day'
        : `1 day on, ${schedule.everyDays - 1} days off`
    case 'weekdays':
      return schedule.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')
    case 'per_week':
      return `${schedule.perWeek} video${schedule.perWeek === 1 ? '' : 's'} a week`
  }
}
