const MAX_PAGE_IDS = 200

export type RefreshRunTarget = {
  creatorId: number | null
  submissionIds: number[]
  allMatching: boolean
}

export function snapshotRefreshTarget(input: {
  creatorId?: number | null
  submissionIds?: unknown
  allMatching?: boolean
}): RefreshRunTarget {
  const creatorId =
    input.creatorId != null && Number.isFinite(Number(input.creatorId)) && Number(input.creatorId) > 0
      ? Math.floor(Number(input.creatorId))
      : null
  const allMatching = Boolean(input.allMatching)
  return {
    creatorId,
    submissionIds: allMatching ? [] : normalizeSubmissionIds(input.submissionIds),
    allMatching,
  }
}

export function refreshRunBelongsToPage(
  runCreatorId: number | null | undefined,
  pageCreatorId: number | null | undefined,
): boolean {
  if (pageCreatorId == null || runCreatorId == null) return true
  return runCreatorId === pageCreatorId
}

export function normalizeSubmissionIds(raw: unknown, max = MAX_PAGE_IDS): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const value of raw) {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || n < 1) continue
    const id = Math.floor(n)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

export function idsOnPage<T extends { id: number }>(rows: T[] | null | undefined): number[] {
  return normalizeSubmissionIds((rows ?? []).map((row) => row.id))
}
