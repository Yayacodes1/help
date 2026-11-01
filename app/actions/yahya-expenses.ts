'use server'

import { revalidatePath } from 'next/cache'
import { canMoveYahyaExpenses } from '@/lib/admin-access'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import {
  addYahyaOtherExpense,
  addYahyaPersonToList,
  clearYahyaPersonOverride,
  deleteYahyaOtherExpense,
  setYahyaHome,
  setYahyaPersonMonthly,
  type YahyaHome,
} from '@/lib/yahya-expenses'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
}

async function requireMovers() {
  await requireAdmin()
  const session = await getAdminSession()
  if (!canMoveYahyaExpenses(session?.id)) {
    return { ok: false as const, error: 'Only Yahya and Ahmed can move people.' }
  }
  return { ok: true as const, session }
}

function refresh() {
  revalidatePath('/admin')
}

export async function addYahyaExpenseItem(input: {
  yearMonth: string
  label: string
  amount: number
  currency: 'USD' | 'SAR'
  note?: string | null
}) {
  await requireAdmin()
  const res = await addYahyaOtherExpense(input)
  if (res.ok) refresh()
  return res
}

export async function removeYahyaExpenseItem(id: number) {
  await requireAdmin()
  const res = await deleteYahyaOtherExpense(id)
  if (res.ok) refresh()
  return res
}

export async function saveYahyaPersonMonthly(input: {
  yearMonth: string
  personKey: string
  amount: number
  currency: 'USD' | 'SAR'
  scope: 'site' | 'page'
  creatorId?: number | null
  leaderId?: number | null
  otherId?: number | null
}) {
  await requireAdmin()
  const res = await setYahyaPersonMonthly(input)
  if (res.ok) refresh()
  return res
}

export async function resetYahyaPersonOverride(input: {
  yearMonth: string
  personKey: string
}) {
  await requireAdmin()
  const res = await clearYahyaPersonOverride(input)
  if (res.ok) refresh()
  return res
}

export async function saveYahyaHome(input: {
  personKey: string
  home: YahyaHome
}) {
  const gate = await requireMovers()
  if (!gate.ok) return gate
  const res = await setYahyaHome(input)
  if (res.ok) refresh()
  return res
}

export async function addYahyaPerson(input: {
  yearMonth: string
  personKey: string
  home: 'creators' | 'reposters' | 'leaders'
  amount: number
  currency: 'USD' | 'SAR'
  scope: 'site' | 'page'
  creatorId?: number | null
  leaderId?: number | null
}) {
  const gate = await requireMovers()
  if (!gate.ok) return gate
  const res = await addYahyaPersonToList(input)
  if (res.ok) refresh()
  return res
}

/** @deprecated use saveYahyaHome */
export async function saveYahyaPlacement(input: {
  personKey: string
  placement: 'leaders' | 'reposters' | 'both'
}) {
  return saveYahyaHome({ personKey: input.personKey, home: input.placement })
}
