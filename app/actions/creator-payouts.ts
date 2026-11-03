'use server'

import { revalidatePath } from 'next/cache'
import { canSeeCreatorPayouts } from '@/lib/admin-access'
import { getAdminSession, isAdmin } from '@/lib/admin-auth'
import {
  assignCreatorToPayerGroup,
  removeCreatorFromPayoutBoard,
  saveCreatorPayoutProfile,
} from '@/lib/creator-payouts'
import type { PayerGroup, PayoutMethod } from '@/lib/creator-payouts-types'

async function requirePayoutAccess() {
  if (!(await isAdmin())) throw new Error('Unauthorized')
  const session = await getAdminSession()
  if (!canSeeCreatorPayouts(session?.id)) {
    throw new Error('Unauthorized')
  }
  return session!
}

function refresh() {
  revalidatePath('/admin')
}

export async function assignCreatorPayout(input: {
  creatorId: number
  payerGroup: PayerGroup
}) {
  const session = await requirePayoutAccess()
  const res = await assignCreatorToPayerGroup({
    creatorId: input.creatorId,
    payerGroup: input.payerGroup,
    updatedBy: session.id,
  })
  if (res.ok) refresh()
  return res
}

export async function removeCreatorPayout(input: { creatorId: number }) {
  await requirePayoutAccess()
  const res = await removeCreatorFromPayoutBoard(input)
  if (res.ok) refresh()
  return res
}

export async function saveCreatorPayout(input: {
  creatorId: number
  payerGroup: PayerGroup
  method: PayoutMethod | null
  paypalEmail?: string | null
  paypalUsername?: string | null
  bankName?: string | null
  accountHolderName?: string | null
  iban?: string | null
  phone?: string | null
  city?: string | null
  baseAmount?: number | null
  commissionAmount?: number | null
  totalAmount?: number | null
  currency?: 'SAR' | 'USD' | null
  dueOn?: string | null
}) {
  const session = await requirePayoutAccess()
  const res = await saveCreatorPayoutProfile({
    ...input,
    updatedBy: session.id,
  })
  if (res.ok) refresh()
  return res
}
