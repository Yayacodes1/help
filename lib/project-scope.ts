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
