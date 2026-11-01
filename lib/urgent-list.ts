import 'server-only'
import { sql } from '@/lib/db'
import { attachTracking, getCreatorsWithProgressOnDate, type CreatorTrackingRow } from '@/lib/queries'
import { amountToSar, daysAhead } from '@/lib/payment-calendar-math'

export type UrgentPayRow = {
  id: number
  name: string
  role: CreatorTrackingRow['role']
  dueOn: string | null
  amountSar: number
  daysLate: number
  settled: boolean
}

export async function listUrgentCreatorIds(): Promise<number[]> {
  const rows = (await sql`
    SELECT creator_id FROM urgent_payments ORDER BY created_at ASC, creator_id ASC
  `) as { creator_id: number }[]
  return rows.map((row) => row.creator_id)
}

function nextUnpaid(person: CreatorTrackingRow): {
  dueOn: string | null
  amount: number
  settled: boolean
} {
  const firstOpen = !person.first_settled && (person.first_due > 0.009 || Boolean(person.first_due_on))
  if (firstOpen) {
    return {
      dueOn: person.first_due_on,
      amount: person.first_balance > 0.009 ? person.first_balance : person.first_due,
      settled: false,
    }
  }
  const secondOpen =
    person.has_two_pays && !person.second_settled && (person.second_due > 0.009 || Boolean(person.second_due_on))
  if (secondOpen) {
    return {
      dueOn: person.second_due_on,
      amount: person.second_balance > 0.009 ? person.second_balance : person.second_due,
      settled: false,
    }
  }
  return {
    dueOn: person.second_due_on ?? person.first_due_on,
    amount: person.has_two_pays ? person.second_due : person.first_due,
    settled: true,
  }
}

export function urgentPayFromTracking(person: CreatorTrackingRow, today: string): UrgentPayRow {
  const next = nextUnpaid(person)
  const daysLate =
    next.settled || !next.dueOn || next.dueOn >= today ? 0 : Math.max(0, daysAhead(next.dueOn, today))
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    dueOn: next.dueOn,
    amountSar: amountToSar(next.amount, person.pay_display_currency),
    daysLate,
    settled: next.settled,
  }
}

export async function loadUrgentList(today: string): Promise<{ ids: number[]; rows: UrgentPayRow[] }> {
  const ids = await listUrgentCreatorIds()
  if (ids.length === 0) return { ids, rows: [] }
  const people = await getCreatorsWithProgressOnDate(today, undefined, null, { creatorIds: ids })
  const tracked = await attachTracking(people, today)
  const rows = tracked
    .map((person) => urgentPayFromTracking(person, today))
    .sort((a, b) => b.daysLate - a.daysLate || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.name.localeCompare(b.name))
  return { ids, rows }
}
