/** Project-name helpers for admin scoping (Notek / Miyqat). */

export function isMiyqatProjectName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase()
  return n.includes('miq') || n.includes('miy')
}

export function isNotekProjectName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase()
  return n.includes('not')
}

/** Badge/select colors so Notek and Miqat rows are easy to tell apart. */
export function projectToneClass(name: string | null | undefined): string {
  if (isMiyqatProjectName(name)) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
  }
  if (isNotekProjectName(name)) {
    return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200'
  }
  return 'border-border bg-background text-muted-foreground'
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
