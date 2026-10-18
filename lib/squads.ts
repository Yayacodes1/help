export const SQUAD_NAMES = ['Alpha', 'Beta', 'Charlie', 'Delta'] as const
export type SquadName = (typeof SQUAD_NAMES)[number]
export type SquadKey = SquadName | 'other'

/** Map a leader's name onto Alpha / Beta / Charlie / Delta. */
export function squadKeyFromName(name: string): SquadKey {
  const n = name.trim().toLowerCase()
  for (const squad of SQUAD_NAMES) {
    if (n === squad.toLowerCase() || n.includes(squad.toLowerCase())) return squad
  }
  return 'other'
}

export function squadLabel(key: SquadKey): string {
  return key === 'other' ? 'Other' : key
}
