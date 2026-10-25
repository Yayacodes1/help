import type { AttendancePerson } from './attendance-types'
import { SQUAD_NAMES, squadKeyFromName, squadLeaderTitle, type SquadName } from './squads'

export type ReportSquad = SquadName | 'ungrouped'

type SquadRoster = {
  leaders: Array<{ name: string; squad?: string | null; people: Array<{ id: number }> }>
  unassigned: { people: Array<{ id: number }> } | null
}

export function parseReportSquad(value: string | undefined): ReportSquad | null {
  if (value === 'none' || value === 'ungrouped') return 'ungrouped'
  return SQUAD_NAMES.find((name) => name === value) ?? null
}

export function squadCallbackToken(squad: ReportSquad): string {
  return squad === 'ungrouped' ? 'none' : squad
}

export function squadMenuTitle(squad: ReportSquad): string {
  if (squad === 'ungrouped') return 'Ungrouped'
  return `${squad} · ${squadLeaderTitle(squad)}`
}

export function personIdsForSquad(board: SquadRoster, squad: ReportSquad): Set<number> {
  if (squad === 'ungrouped') {
    return new Set((board.unassigned?.people ?? []).map((person) => person.id))
  }
  const ids = new Set<number>()
  for (const row of board.leaders) {
    if (squadKeyFromName(row.name, row.squad) === squad) {
      for (const person of row.people) ids.add(person.id)
    }
  }
  return ids
}

export function peopleInSquad(
  everyone: AttendancePerson[],
  board: SquadRoster,
  squad: ReportSquad,
  role?: AttendancePerson['role'],
): AttendancePerson[] {
  const ids = personIdsForSquad(board, squad)
  return everyone.filter((person) => ids.has(person.id) && (role == null || person.role === role))
}

export function groupLeaderButtons(mode: string) {
  return {
    inline_keyboard: [
      [
        { text: 'Alpha · Ammar', callback_data: `sq:Alpha:${mode}` },
        { text: 'Beta · Abdul Kareem', callback_data: `sq:Beta:${mode}` },
      ],
      [
        { text: 'Charlie · Lina', callback_data: `sq:Charlie:${mode}` },
        { text: 'Delta · Sultan', callback_data: `sq:Delta:${mode}` },
      ],
      [{ text: 'Ungrouped', callback_data: `sq:none:${mode}` }],
    ],
  }
}

export function squadRoleButtons(squad: ReportSquad, mode: string) {
  const token = squadCallbackToken(squad)
  return {
    inline_keyboard: [
      [
        { text: '✉️ Creators', callback_data: `sqm:${token}:creator:${mode}` },
        { text: '✉️ Reposters', callback_data: `sqm:${token}:reposter:${mode}` },
      ],
      [{ text: '← Groups', callback_data: `gl:${mode}` }],
    ],
  }
}

export function groupLeaderPrompt(): string {
  return (
    '👑 GROUP LEADER\n' +
    'Pick a group, then Creators or Reposters. You will get the reminder text for that group only.\n\n' +
    'Alpha · Ammar\n' +
    'Beta · Abdul Kareem\n' +
    'Charlie · Lina\n' +
    'Delta · Sultan\n' +
    'Ungrouped — people with no leader'
  )
}

export function squadRolePrompt(squad: ReportSquad): string {
  const title = squadMenuTitle(squad)
  return (
    `👑 ${title}\n` +
    `✉️ Creators — reminders for ${title} creators who are behind.\n` +
    `✉️ Reposters — the same for ${title} reposters.`
  )
}
