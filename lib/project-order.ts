function projectOrder(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('not')) return `0-${n}`
  if (n.includes('miq') || n.includes('miy')) return `1-${n}`
  return `2-${n}`
}

export function sortProjects<T extends { name: string }>(projects: T[]): T[] {
  return [...projects].sort((a, b) => projectOrder(a.name).localeCompare(projectOrder(b.name)))
}
