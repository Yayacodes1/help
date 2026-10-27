export const VIDEO_PAGE_SIZES = [25, 50, 100] as const
export type VideoPageSize = (typeof VIDEO_PAGE_SIZES)[number]

/** Default Videos page length. */
export const VIDEO_PAGE_SIZE: VideoPageSize = 50

export function parseVideoPage(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 500) : 1
}

export function parseVideoPageSize(value: string | undefined): VideoPageSize {
  const n = Number(value)
  if (n === 25 || n === 50 || n === 100) return n
  return VIDEO_PAGE_SIZE
}

export function videoPaging(sp: {
  vPage?: string
  vSize?: string
  [key: string]: string | undefined
}) {
  const pageSize = parseVideoPageSize(sp.vSize)
  const page = parseVideoPage(sp.vPage)
  return { page, pageSize, offset: (page - 1) * pageSize }
}
