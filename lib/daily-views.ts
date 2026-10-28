export const DAILY_VIEWS_TZ = 'Asia/Riyadh'

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((p) => p.type === type)?.value)
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const asUtc = Date.UTC(
    partNumber(parts, 'year'),
    partNumber(parts, 'month') - 1,
    partNumber(parts, 'day'),
    partNumber(parts, 'hour'),
    partNumber(parts, 'minute'),
    partNumber(parts, 'second'),
  )
  return asUtc - instant.getTime()
}

export function zonedDayStartUtc(ymd: string, timeZone: string = DAILY_VIEWS_TZ): Date {
  let utc = Date.parse(`${ymd}T00:00:00.000Z`)
  for (let i = 0; i < 4; i++) {
    const offset = tzOffsetMs(new Date(utc), timeZone)
    utc = Date.parse(`${ymd}T00:00:00.000Z`) - offset
  }
  return new Date(utc)
}

function zonedDayRangeUtc(ymd: string, timeZone: string = DAILY_VIEWS_TZ): { start: Date; end: Date } {
  return { start: zonedDayStartUtc(ymd, timeZone), end: zonedDayStartUtc(addDays(ymd, 1), timeZone) }
}

export function calendarDayInTimeZone(iso: string, tz: string): string {
  const date = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = partNumber(parts, 'year')
  const month = partNumber(parts, 'month')
  const day = partNumber(parts, 'day')
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export type ViewSnapshotPoint = {
  videoId: string
  views: number
  observedAt: string
}

export type VideoDayGain = {
  videoId: string
  gain: number | null
  reason: 'measured' | 'collecting' | 'missing'
}

export type DayGainResult = {
  day: string
  gain: number
  measuredVideos: number
  collectingVideos: number
  missingVideos: number
  trackedVideos: number
  lastObservedAt: string | null
  /** True when the last reading on a completed day was more than 3 hours before midnight. */
  closeIsEarly: boolean
}

export type DailyViewsCompare = {
  mode: 'live' | 'final'
  currentDay: string
  previousDay: string
  currentGain: number | null
  previousGain: number | null
  delta: number | null
  pct: number | null
  status: 'ok' | 'collecting' | 'unavailable'
  lastRefreshAt: string | null
  current: DayGainResult
  previous: DayGainResult
}

/** `(today − yesterday) / yesterday × 100`. Both zero → 0. Yesterday zero → null (N/A). */
export function dailyViewsChangePct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today === 0 ? 0 : null
  return ((today - yesterday) / yesterday) * 100
}

export function formatSignedCount(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US')
  if (n > 0) return `+${body}`
  if (n < 0) return `−${body}`
  return '0'
}

export function formatPct(pct: number | null): string {
  if (pct == null) return 'N/A'
  const abs = Math.abs(pct)
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (pct > 0) return `+${body}%`
  if (pct < 0) return `−${body}%`
  return '0%'
}

function trendEmoji(delta: number | null): string {
  if (delta == null || delta === 0) return ''
  return delta > 0 ? ' 📈' : ' 📉'
}

/**
 * Gain for one video on Riyadh day `day`.
 * First observation is a baseline (lifetime views are not today's gain).
 * Repeated snapshots on the same day collapse to last − first-after-baseline.
 * Platform decreases do not reduce the day total.
 */
export function videoDayGain(
  points: Array<{ views: number; observedAt: string }>,
  day: string,
  now: Date = new Date(),
): { gain: number | null; reason: VideoDayGain['reason'] } {
  const { start, end } = zonedDayRangeUtc(day)
  const closeAt = now.getTime() < end.getTime() ? now : end
  const ordered = [...points]
    .filter((p) => Number.isFinite(p.views) && p.views >= 0 && !Number.isNaN(Date.parse(p.observedAt)))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))

  let baseline: { views: number; at: number } | null = null
  let close: { views: number; at: number } | null = null
  for (const p of ordered) {
    const at = Date.parse(p.observedAt)
    if (at < start.getTime()) {
      baseline = { views: p.views, at }
      continue
    }
    if (at >= closeAt.getTime()) break
    if (at >= start.getTime()) {
      if (!baseline) baseline = { views: p.views, at }
      else if (at > baseline.at) close = { views: p.views, at }
    }
  }

  if (!baseline) return { gain: null, reason: 'collecting' }
  if (!close) return { gain: null, reason: baseline.at >= start.getTime() ? 'collecting' : 'missing' }
  return { gain: Math.max(0, close.views - baseline.views), reason: 'measured' }
}

export function aggregateDayGains(
  snapshots: ViewSnapshotPoint[],
  day: string,
  now: Date = new Date(),
): DayGainResult {
  const byVideo = new Map<string, Array<{ views: number; observedAt: string }>>()
  let lastObservedAt: string | null = null
  for (const row of snapshots) {
    if (!row.videoId) continue
    const list = byVideo.get(row.videoId) ?? []
    list.push({ views: row.views, observedAt: row.observedAt })
    byVideo.set(row.videoId, list)
    if (!lastObservedAt || Date.parse(row.observedAt) > Date.parse(lastObservedAt)) {
      lastObservedAt = row.observedAt
    }
  }

  const { start, end } = zonedDayRangeUtc(day)
  const dayEnd = now.getTime() < end.getTime() ? now : end
  let gain = 0
  let measuredVideos = 0
  let collectingVideos = 0
  let missingVideos = 0
  let lastOnDay: number | null = null

  for (const points of byVideo.values()) {
    const one = videoDayGain(points, day, now)
    if (one.reason === 'measured' && one.gain != null) {
      gain += one.gain
      measuredVideos += 1
    } else if (one.reason === 'collecting') collectingVideos += 1
    else missingVideos += 1
    for (const p of points) {
      const at = Date.parse(p.observedAt)
      if (at >= start.getTime() && at < dayEnd.getTime()) {
        lastOnDay = lastOnDay == null ? at : Math.max(lastOnDay, at)
      }
    }
  }

  const hoursBeforeEnd = lastOnDay == null ? Infinity : (end.getTime() - lastOnDay) / 3_600_000
  const dayAlreadyEnded = now.getTime() >= end.getTime()
  return {
    day,
    gain,
    measuredVideos,
    collectingVideos,
    missingVideos,
    trackedVideos: byVideo.size,
    lastObservedAt,
    closeIsEarly: dayAlreadyEnded && lastOnDay != null && hoursBeforeEnd > 3,
  }
}

export function buildDailyViewsCompare(input: {
  mode: 'live' | 'final'
  currentDay: string
  current: DayGainResult
  previous: DayGainResult
}): DailyViewsCompare {
  const previousDay = addDays(input.currentDay, -1)
  const currentOk = input.current.measuredVideos > 0
  const previousOk = input.previous.measuredVideos > 0
  const currentGain = currentOk ? input.current.gain : null
  const previousGain = previousOk ? input.previous.gain : null
  let status: DailyViewsCompare['status'] = 'ok'
  if (!currentOk && !previousOk) status = input.current.trackedVideos > 0 ? 'collecting' : 'unavailable'
  else if (!currentOk || !previousOk) status = 'collecting'

  const delta =
    currentGain != null && previousGain != null ? currentGain - previousGain : null
  const pct =
    currentGain != null && previousGain != null
      ? dailyViewsChangePct(currentGain, previousGain)
      : null

  const lastRefreshAt = [input.current.lastObservedAt, input.previous.lastObservedAt]
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

  return {
    mode: input.mode,
    currentDay: input.currentDay,
    previousDay,
    currentGain,
    previousGain,
    delta,
    pct,
    status,
    lastRefreshAt,
    current: input.current,
    previous: input.previous,
  }
}

function enDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function riyadhClock(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    timeZone: DAILY_VIEWS_TZ,
  })
}

function coverageNote(row: DayGainResult, kind: 'live' | 'full'): string | null {
  const parts: string[] = []
  const total = row.measuredVideos + row.collectingVideos + row.missingVideos
  if (total === 0) return null
  if (row.measuredVideos < total) {
    parts.push(`${row.measuredVideos.toLocaleString('en-US')}/${total.toLocaleString('en-US')} videos measured`)
  } else {
    parts.push(`${row.measuredVideos.toLocaleString('en-US')} videos measured`)
  }
  if (row.collectingVideos > 0) {
    parts.push(`${row.collectingVideos.toLocaleString('en-US')} collecting`)
  }
  if (row.missingVideos > 0) {
    parts.push(`${row.missingVideos.toLocaleString('en-US')} not refreshed`)
  }
  if (kind === 'full' && row.closeIsEarly) {
    parts.push('missing late-day snapshot')
  }
  return parts.join(' · ')
}

export function formatDailyViewsSection(compare: DailyViewsCompare): string {
  const lines = ['📈 DAILY VIEWS — Riyadh time']
  if (compare.status === 'unavailable') {
    lines.push('History unavailable.')
    lines.push('A comparison appears after two successful refreshes span consecutive Riyadh days.')
    return lines.join('\n')
  }
  if (compare.status === 'collecting' && compare.currentGain == null && compare.previousGain == null) {
    lines.push('Collecting data — first snapshots are the baseline, not today’s views.')
    lines.push('A comparison appears after two successful refreshes span consecutive Riyadh days.')
    if (compare.lastRefreshAt) lines.push(`Last refresh: ${riyadhClock(compare.lastRefreshAt)}`)
    return lines.join('\n')
  }

  const currentLabel =
    compare.mode === 'live' ? 'Today so far' : enDay(compare.currentDay)
  const previousLabel =
    compare.mode === 'live' ? 'Yesterday, full day' : enDay(compare.previousDay)

  const currentText =
    compare.currentGain == null ? 'Collecting data' : compare.currentGain.toLocaleString('en-US')
  const previousText =
    compare.previousGain == null ? 'History unavailable' : compare.previousGain.toLocaleString('en-US')

  lines.push(`${currentLabel}: ${currentText}`)
  lines.push(`${previousLabel}: ${previousText}`)

  if (compare.currentGain != null && compare.previousGain != null) {
    lines.push(
      `Change: ${formatSignedCount(compare.delta ?? 0)} (${formatPct(compare.pct)})${trendEmoji(compare.delta)}`,
    )
  } else {
    lines.push('Change: History unavailable')
  }

  const notes: string[] = []
  if (compare.lastRefreshAt) notes.push(`Last refresh: ${riyadhClock(compare.lastRefreshAt)}`)
  const cover = coverageNote(compare.current, compare.mode === 'live' ? 'live' : 'full')
  if (cover) notes.push(cover)
  if (compare.mode === 'final' && compare.previous.closeIsEarly) {
    notes.push('Previous day missing a late snapshot — totals are estimates between observations.')
  } else if (compare.current.measuredVideos < compare.current.trackedVideos) {
    notes.push('Snapshot totals are estimates between observations, not exact midnight-to-midnight counts.')
  }
  if (notes.length) lines.push(notes.join(' · '))
  return lines.join('\n')
}

export function snapshotVideoId(videoKey: string | null | undefined, submissionId: number): string {
  const key = videoKey?.trim()
  return key ? key : `id:${submissionId}`
}

export function snapshotRiyadhDay(observedAt: string): string {
  return calendarDayInTimeZone(observedAt, DAILY_VIEWS_TZ)
}
