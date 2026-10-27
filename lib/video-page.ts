export const VIDEO_PAGE_SIZE = 40

export function parseVideoPage(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 500) : 1
}
