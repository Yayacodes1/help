export const SQUAD_NAMES = ['Alpha', 'Beta', 'Charlie', 'Delta'] as const
export type SquadName = (typeof SQUAD_NAMES)[number]
export type SquadKey = SquadName | 'other'

const NAME_TO_SQUAD: Array<{ match: RegExp; squad: SquadName }> = [
  { match: /\balpha\b/i, squad: 'Alpha' },
  { match: /\bbeta\b/i, squad: 'Beta' },
  { match: /\bcharlie\b/i, squad: 'Charlie' },
  { match: /\bdelta\b/i, squad: 'Delta' },
  { match: /\bamm?ar\b/i, squad: 'Alpha' },
  { match: /\babdul[\s-]*karee?m\b/i, squad: 'Beta' },
  { match: /\babdul[\s-]*karim\b/i, squad: 'Beta' },
  { match: /\blinas?\b/i, squad: 'Charlie' },
  { match: /\bsultan\b/i, squad: 'Delta' },
]

export function parseSquad(value: string | null | undefined): SquadName | null {
  const raw = (value ?? '').trim()
  return SQUAD_NAMES.find((name) => name.toLowerCase() === raw.toLowerCase()) ?? null
}

/** Map a leader's saved squad or name onto Alpha / Beta / Charlie / Delta. */
export function squadKeyFromName(name: string, savedSquad?: string | null): SquadKey {
  const saved = parseSquad(savedSquad)
  if (saved) return saved
  const n = name.trim()
  if (!n) return 'other'
  for (const row of NAME_TO_SQUAD) {
    if (row.match.test(n)) return row.squad
  }
  return 'other'
}

export function squadLabel(key: SquadKey): string {
  return key === 'other' ? 'Unassigned' : key
}

export function squadLeaderTitle(squad: SquadName): string {
  if (squad === 'Alpha') return 'Ammar'
  if (squad === 'Beta') return 'Abdul Kareem'
  if (squad === 'Charlie') return 'Lina'
  return 'Sultan'
}
