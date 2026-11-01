'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/admin-auth'
import {
  addYahyaOtherExpense,
  deleteYahyaOtherExpense,
} from '@/lib/yahya-expenses'

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
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
  if (res.ok) revalidatePath('/admin')
  return res
}

export async function removeYahyaExpenseItem(id: number) {
  await requireAdmin()
  const res = await deleteYahyaOtherExpense(id)
  if (res.ok) revalidatePath('/admin')
  return res
}
