'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/admin-auth'
import {
  addYahyaOtherExpense,
  clearYahyaPersonOverride,
  deleteYahyaOtherExpense,
  setYahyaPersonMonthly,
  setYahyaPlacement,
  type YahyaPlacement,
} from '@/lib/yahya-expenses'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
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

export async function saveYahyaPlacement(input: {
  personKey: string
  placement: YahyaPlacement
}) {
  await requireAdmin()
  const res = await setYahyaPlacement(input)
  if (res.ok) refresh()
  return res
}
