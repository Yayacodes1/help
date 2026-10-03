/** Project-name helpers for admin scoping (Notek / Miyqat). */

export function isMiyqatProjectName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase()
  return n.includes('miq') || n.includes('miy')
}

export function isNotekProjectName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase()
  return n.includes('not')
}

export function findProjectById<T extends { id: number; name: string }>(
  projects: T[],
  projectId: number | null | undefined,
): T | null {
  if (projectId == null || !Number.isFinite(projectId)) return null
  return projects.find((p) => p.id === projectId) ?? null
}

export function findMiyqatProject<T extends { id: number; name: string }>(
  projects: T[],
): T | null {
  return projects.find((p) => isMiyqatProjectName(p.name)) ?? null
}

/** `?project=split`: Notek and Miqat shown left/right instead of one project. */
export const SPLIT_PROJECT_VALUE = 'split'

/** URL key for one project's people filter in the side-by-side view. */
export function sideRoleKey(projectId: number): string {
  return `role${projectId}`
}

/** Notek left, Miqat right; falls back to the first two projects. */
export function splitProjectPair<T extends { id: number; name: string }>(projects: T[]): T[] {
  const notek = projects.find((p) => isNotekProjectName(p.name))
  const miqat = projects.find((p) => isMiyqatProjectName(p.name))
  if (notek && miqat && notek.id !== miqat.id) return [notek, miqat]
  return projects.slice(0, 2)
}
