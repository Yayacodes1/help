import { addDays } from '@/lib/campaign'
import {
  daysBetweenInclusive,
  inferBiweeklyInstallments,
} from '@/lib/biweekly'

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type HalfIndex = 1 | 2

export type ContractHalfWindow = {
  index: HalfIndex
  label: string
  start: string
  end: string
}

export type HalfPayment = {
  amount: number
  paid_on: string
  note: string | null
}

export type ContractHalfStatus = ContractHalfWindow & {
  dueAmount: number
  paidAmount: number
  balance: number
  settled: boolean
  lastPaidOn: string | null
  videoCount: number
  postedInstagram: number
  postedTiktok: number
}

/** True when the period is long enough to pay in two biweekly waves. */
export function contractSupportsBiweeklyHalves(
  start: string,
  end: string | null,
  everyDays = 14,
): boolean {
  if (!start || !end) return false
  const every = everyDays > 0 ? Math.floor(everyDays) : 14
  return daysBetweenInclusive(start, end) > every + 3
}

/** Midpoint: 2nd half starts `everyDays` after contract start. */
export function contractHalfWindows(
  start: string,
  end: string,
  everyDays = 14,
): [ContractHalfWindow, ContractHalfWindow] {
  const every = everyDays > 0 ? Math.floor(everyDays) : 14
  const secondStart = addDays(start, every)
  const firstEnd =
    secondStart > end ? end : addDays(secondStart, -1)
  const clampedSecondStart = secondStart > end ? end : secondStart
  return [
    {
      index: 1,
      label: '1st half',
      start,
      end: firstEnd < start ? start : firstEnd,
    },
    {
      index: 2,
      label: '2nd half',
      start: clampedSecondStart,
      end,
    },
  ]
}

export function halfIndexFromNote(note: string | null | undefined): HalfIndex | null {
  const n = (note ?? '').toLowerCase()
  if (!n) return null
  if (n.includes('1st') || n.includes('first') || n.includes('upfront')) return 1
  if (
    n.includes('2nd') ||
    n.includes('second') ||
    n.includes('mid') ||
    n.includes('day 15')
  ) {
    return 2
  }
  return null
}

export function halfPaymentNote(half: HalfIndex, contractName: string): string {
  return half === 1
    ? `1st half · ${contractName}`
    : `2nd half · ${contractName}`
}

/**
 * Split recorded payments across the two halves.
 * Prefers note tags (1st/2nd); otherwise fills half 1 then half 2 in pay order.
 * A single untags full settlement is shown as the inferred biweekly split.
 */
export function assignPaymentsToHalves(
  payments: HalfPayment[],
  firstDue: number,
  secondDue: number,
): {
  firstPaid: number
  secondPaid: number
  firstLastPaidOn: string | null
  secondLastPaidOn: string | null
} {
  const firstCap = roundMoney(firstDue)
  const secondCap = roundMoney(secondDue)
  const ordered = [...payments].sort((a, b) => {
    if (a.paid_on !== b.paid_on) return a.paid_on < b.paid_on ? -1 : 1
    return 0
  })

  const totalPaid = roundMoney(ordered.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  const tagged = ordered.some((p) => halfIndexFromNote(p.note) != null)
  const fullDue = roundMoney(firstCap + secondCap)

  // One untags settlement covering the whole deal → show both halves paid.
  if (
    !tagged &&
    ordered.length === 1 &&
    fullDue > 0.009 &&
    totalPaid >= fullDue - 0.009
  ) {
    const split = inferBiweeklyInstallments(fullDue, [totalPaid])
    return {
      firstPaid: split.first,
      secondPaid: roundMoney(totalPaid - split.first),
      firstLastPaidOn: ordered[0].paid_on,
      secondLastPaidOn: ordered[0].paid_on,
    }
  }

  let firstPaid = 0
  let secondPaid = 0
  let firstLastPaidOn: string | null = null
  let secondLastPaidOn: string | null = null
  const unassigned: HalfPayment[] = []

  for (const p of ordered) {
    const amt = roundMoney(p.amount)
    if (amt <= 0) continue
    const half = halfIndexFromNote(p.note)
    if (half === 1) {
      firstPaid = roundMoney(firstPaid + amt)
      firstLastPaidOn = p.paid_on
    } else if (half === 2) {
      secondPaid = roundMoney(secondPaid + amt)
      secondLastPaidOn = p.paid_on
    } else {
      unassigned.push(p)
    }
  }

  for (const p of unassigned) {
    let remaining = roundMoney(p.amount)
    if (remaining <= 0) continue

    const firstRoom = Math.max(0, roundMoney(firstCap - firstPaid))
    if (firstRoom > 0.009) {
      const take = Math.min(remaining, firstRoom)
      firstPaid = roundMoney(firstPaid + take)
      firstLastPaidOn = p.paid_on
      remaining = roundMoney(remaining - take)
    }
    if (remaining > 0.009) {
      secondPaid = roundMoney(secondPaid + remaining)
      secondLastPaidOn = p.paid_on
    }
  }

  return { firstPaid, secondPaid, firstLastPaidOn, secondLastPaidOn }
}

export function buildContractHalves(opts: {
  start: string
  end: string
  dueTotal: number
  payments: HalfPayment[]
  everyDays?: number
  firstVideos: { total: number; instagram: number; tiktok: number }
  secondVideos: { total: number; instagram: number; tiktok: number }
}): ContractHalfStatus[] {
  const [w1, w2] = contractHalfWindows(opts.start, opts.end, opts.everyDays)
  const split = inferBiweeklyInstallments(opts.dueTotal, [])
  const assigned = assignPaymentsToHalves(opts.payments, split.first, split.second)

  const mk = (
    window: ContractHalfWindow,
    due: number,
    paid: number,
    lastPaidOn: string | null,
    videos: { total: number; instagram: number; tiktok: number },
  ): ContractHalfStatus => {
    const dueAmount = roundMoney(due)
    const paidAmount = roundMoney(paid)
    const balance = Math.max(0, roundMoney(dueAmount - paidAmount))
    return {
      ...window,
      dueAmount,
      paidAmount,
      balance,
      settled: dueAmount <= 0.009 ? paidAmount > 0.009 : balance <= 0.009,
      lastPaidOn,
      videoCount: videos.total,
      postedInstagram: videos.instagram,
      postedTiktok: videos.tiktok,
    }
  }

  return [
    mk(w1, split.first, assigned.firstPaid, assigned.firstLastPaidOn, opts.firstVideos),
    mk(w2, split.second, assigned.secondPaid, assigned.secondLastPaidOn, opts.secondVideos),
  ]
}
