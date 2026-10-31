import { addDays, calendarMonthRange } from '@/lib/campaign'
import {
  inferBiweeklyInstallments,
  typicalBiweeklyAmount,
  type BiweeklyInstallment,
} from '@/lib/biweekly'
import {
  contractSupportsBiweeklyHalves,
  normalizeBasePayCadence,
  periodBaseTotal,
} from '@/lib/contract-halves'
import { payCurrency } from '@/lib/format'
import { normalizePlatforms, videoCompletionRate } from '@/lib/platforms-mode'
import type { ParticipantRole } from '@/lib/participant-role'
import {
  amountToSar,
  buildCreatorPaySchedule,
  monthGridDates,
  roundMoney,
  settleObligationsLite,
  statusFor,
  urgencyFor,
  type PayUrgency,
} from '@/lib/payment-calendar-math'

export { amountToSar, monthGridDates, roundMoney, statusFor, urgencyFor, type PayUrgency }

function targetVideoTotal(platforms: string | null, ig: number, tt: number): number {
  const mode = normalizePlatforms(platforms)
  const needIg = mode === 'tiktok' ? 0 : Math.max(0, ig)
  const needTt = mode === 'instagram' ? 0 : Math.max(0, tt)
  return needIg + needTt
}

export type CalendarRoleFilter = 'creator' | 'reposter' | 'all'
export type CalendarPayStatus = 'paid' | 'partial' | 'due' | 'overdue' | 'scheduled'

export type CalendarContractInput = {
  contractId: number
  contractName: string
  startDate: string
  endDate: string | null
  baseAmount: number
  commissionAmount: number | null
  basePayCadence: string | null
  targetInstagram: number
  targetTiktok: number
  platforms: string | null
  payEveryDays: number
  creatorId: number
  creatorName: string
  role: ParticipantRole
  payCurrency: string | null
  pausedAt: string | null
  projectId: number | null
  projectName: string | null
}

export type CalendarPaymentInput = {
  id: number
  creatorId: number
  contractId: number | null
  paidOn: string
  amount: number
  note: string | null
  creatorName: string
  role: ParticipantRole
  payCurrency: string | null
  contractName: string | null
}

export type CalendarVideoHit = {
  creatorId: number
  videoDate: string
  platform: 'instagram' | 'tiktok'
}

export type CalendarObligation = {
  key: string
  creatorId: number
  creatorName: string
  role: ParticipantRole
  projectId: number | null
  projectName: string | null
  contractId: number
  contractName: string
  contractStart: string
  contractEnd: string | null
  installmentIndex: number
  installmentLabel: string
  dueDate: string
  dueAmount: number
  dueAmountSar: number
  currency: 'USD' | 'SAR'
  videosComplete: boolean
  videoCount: number
  targetTotal: number
  videoRate: number | null
  awaitingEligibility: boolean
  contractCommission: number
  contractCommissionSar: number
  commissionInDue: boolean
}

export type CalendarTxn = {
  id: number
  creatorId: number
  creatorName: string
  role: ParticipantRole
  contractId: number | null
  contractName: string | null
  paidOn: string
  amount: number
  amountSar: number
  currency: 'USD' | 'SAR'
  note: string | null
}

export type SettledObligation = CalendarObligation & {
  paidAmount: number
  paidAmountSar: number
  remaining: number
  remainingSar: number
  status: CalendarPayStatus
  lastPaidOn: string | null
}

export type UnscheduledPayment = CalendarTxn & {
  leftoverSar: number
}

export type CalendarDayCell = {
  date: string
  inMonth: boolean
  isToday: boolean
  scheduledSar: number
  remainingSar: number
  paidSar: number
  recipientCount: number
  unpaidCount: number
  creators: number
  reposters: number
  statuses: CalendarPayStatus[]
  urgency: PayUrgency
  names: string[]
  items: SettledObligation[]
}

export type PaymentCalendarModel = {
  month: string
  start: string
  end: string
  today: string
  role: CalendarRoleFilter
  spentSar: number
  scheduledTotalSar: number
  remainingScheduledSar: number
  commissionEarnedSar: number
  commissionRecordedSar: number
  commissionDueSar: number
  days: CalendarDayCell[]
  unscheduled: UnscheduledPayment[]
  undated: SettledObligation[]
  items: SettledObligation[]
  payments: CalendarTxn[]
}

export function parseCalendarRole(value: string | null | undefined): CalendarRoleFilter {
  if (value === 'creator' || value === 'reposter') return value
  return 'all'
}

function contractWindow(start: string, end: string | null, slack: boolean) {
  const last = end ?? start
  if (!slack) return { start, end: last }
  return { start: addDays(start, -1), end: addDays(last, 1) }
}

export function videosForContract(
  hits: CalendarVideoHit[],
  creatorId: number,
  start: string,
  end: string | null,
): { instagram: number; tiktok: number; total: number } {
  const window = contractWindow(start, end, true)
  let instagram = 0
  let tiktok = 0
  for (const hit of hits) {
    if (hit.creatorId !== creatorId) continue
    if (hit.videoDate < window.start || hit.videoDate > window.end) continue
    if (hit.platform === 'instagram') instagram++
    else tiktok++
  }
  return { instagram, tiktok, total: instagram + tiktok }
}

export function obligationsFromContract(
  contract: CalendarContractInput,
  hits: CalendarVideoHit[],
  through: string,
): CalendarObligation[] {
  if (contract.pausedAt) return []
  const cadence = normalizeBasePayCadence(contract.basePayCadence)
  const hasHalves = contractSupportsBiweeklyHalves(contract.startDate, contract.endDate)
  const base = periodBaseTotal(contract.baseAmount, cadence, hasHalves)
  const commission = contract.commissionAmount == null ? 0 : Number(contract.commissionAmount)
  const full = roundMoney(base + commission)
  const every = contract.payEveryDays > 0 ? contract.payEveryDays : 15
  const currency = payCurrency(contract.role, contract.payCurrency)
  const commissionInDue = Boolean(contract.endDate)
  if (base <= 0 && commission <= 0) return []

  const slices = buildCreatorPaySchedule({
    startDate: contract.startDate,
    endDate: contract.endDate,
    cadence,
    through,
  })
  const split = inferBiweeklyInstallments(full)
  const wave = typicalBiweeklyAmount({
    baseAmount: base,
    startDate: contract.startDate,
    endDate: contract.endDate,
    payEveryDays: every,
  })
  const schedule: BiweeklyInstallment[] = slices.map((slice) => {
    let amount = full
    if (slices.length === 2) amount = slice.index === 0 ? split.first : split.second
    else if (slices.length > 2) amount = wave > 0.009 ? wave : split.first
    return {
      dueOn: slice.dueOn,
      amount,
      index: slice.index,
      label: slice.label,
    }
  })

  const counts = videosForContract(hits, contract.creatorId, contract.startDate, contract.endDate)
  const targetTotal = targetVideoTotal(
    contract.platforms,
    contract.targetInstagram,
    contract.targetTiktok,
  )
  const videoRate = videoCompletionRate({
    postedInstagram: counts.instagram,
    postedTiktok: counts.tiktok,
    targetInstagram: contract.targetInstagram,
    targetTiktok: contract.targetTiktok,
    platforms: contract.platforms,
  })
  const videosComplete = videoRate != null && videoRate >= 0.999
  const awaitingEligibility = targetTotal > 0 && !videosComplete

  return schedule
    .filter((inst) => inst.amount > 0.009)
    .map((inst) => ({
      key: `${contract.contractId}:${inst.index}`,
      creatorId: contract.creatorId,
      creatorName: contract.creatorName,
      role: contract.role,
      projectId: contract.projectId,
      projectName: contract.projectName,
      contractId: contract.contractId,
      contractName: contract.contractName,
      contractStart: contract.startDate,
      contractEnd: contract.endDate,
      installmentIndex: inst.index,
      installmentLabel: inst.label,
      dueDate: inst.dueOn || '',
      dueAmount: roundMoney(inst.amount),
      dueAmountSar: amountToSar(inst.amount, currency),
      currency,
      videosComplete,
      videoCount: counts.total,
      targetTotal,
      videoRate,
      awaitingEligibility,
      contractCommission: roundMoney(commission),
      contractCommissionSar: amountToSar(commission, currency),
      commissionInDue,
    }))
}

/** Apply recorded payments to obligations without creating extra dues or double-counting. */
export function settleObligations(
  obligations: CalendarObligation[],
  payments: CalendarTxn[],
  today: string,
): { items: SettledObligation[]; leftover: UnscheduledPayment[] } {
  const lite = settleObligationsLite(obligations, payments, today)
  const byKey = new Map(obligations.map((o) => [o.key, o]))
  const items = lite.items.map((row) => {
    const o = byKey.get(row.key)!
    const ratio = o.dueAmountSar > 0 ? o.dueAmount / o.dueAmountSar : 1
    return {
      ...o,
      paidAmount: roundMoney(row.paidAmountSar * ratio),
      paidAmountSar: row.paidAmountSar,
      remaining: roundMoney(row.remainingSar * ratio),
      remainingSar: row.remainingSar,
      status: row.status,
      lastPaidOn: row.lastPaidOn,
    }
  })
  const leftover: UnscheduledPayment[] = lite.leftover.map((row) => {
    const pay = payments.find((p) => p.id === row.id)!
    return { ...pay, leftoverSar: row.leftoverSar }
  })
  return { items, leftover }
}

export function buildPaymentCalendarModel(opts: {
  month: string
  today: string
  role: CalendarRoleFilter
  contracts: CalendarContractInput[]
  payments: CalendarPaymentInput[]
  videos: CalendarVideoHit[]
  commissionEarnedSar: number
  commissionRecordedSar: number
  commissionDueSar: number
}): PaymentCalendarModel {
  const { start, end } = calendarMonthRange(opts.month)
  const through = end
  const obligations: CalendarObligation[] = []
  for (const contract of opts.contracts) {
    if (opts.role !== 'all' && contract.role !== opts.role) continue
    obligations.push(...obligationsFromContract(contract, opts.videos, through))
  }

  const txns: CalendarTxn[] = opts.payments
    .filter((p) => opts.role === 'all' || p.role === opts.role)
    .map((p) => {
      const currency = payCurrency(p.role, p.payCurrency)
      return {
        id: p.id,
        creatorId: p.creatorId,
        creatorName: p.creatorName,
        role: p.role,
        contractId: p.contractId,
        contractName: p.contractName,
        paidOn: p.paidOn,
        amount: roundMoney(p.amount),
        amountSar: amountToSar(p.amount, currency),
        currency,
        note: p.note,
      }
    })

  const { items, leftover } = settleObligations(obligations, txns, opts.today)
  const dated = items.filter((i) => Boolean(i.dueDate))
  const undated = items.filter((i) => !i.dueDate)
  const monthItems = dated.filter((i) => i.dueDate >= start && i.dueDate <= end)
  const spentSar = roundMoney(
    txns.filter((p) => p.paidOn >= start && p.paidOn <= end).reduce((s, p) => s + p.amountSar, 0),
  )
  const scheduledTotalSar = roundMoney(
    monthItems.reduce((s, i) => s + i.dueAmountSar, 0),
  )
  const remainingScheduledSar = roundMoney(
    monthItems.reduce((s, i) => s + i.remainingSar, 0),
  )
  const unscheduled = leftover.filter((p) => p.paidOn >= start && p.paidOn <= end)

  const byDate = new Map<string, SettledObligation[]>()
  for (const item of monthItems) {
    const list = byDate.get(item.dueDate) ?? []
    list.push(item)
    byDate.set(item.dueDate, list)
  }

  const days = monthGridDates(start, end).map((date) => {
    const dayItems = byDate.get(date) ?? []
    const unpaid = dayItems.filter((i) => i.remainingSar > 0.009)
    const recipients = new Set(dayItems.map((i) => i.creatorId))
    const statuses = [...new Set(dayItems.map((i) => i.status))]
    const remainingSar = roundMoney(dayItems.reduce((s, i) => s + i.remainingSar, 0))
    const names = [...new Map(unpaid.map((i) => [i.creatorId, i.creatorName])).values()]
    return {
      date,
      inMonth: date >= start && date <= end,
      isToday: date === opts.today,
      scheduledSar: roundMoney(dayItems.reduce((s, i) => s + i.dueAmountSar, 0)),
      remainingSar,
      paidSar: roundMoney(dayItems.reduce((s, i) => s + i.paidAmountSar, 0)),
      recipientCount: recipients.size,
      unpaidCount: new Set(unpaid.map((i) => i.creatorId)).size,
      creators: new Set(unpaid.filter((i) => i.role === 'creator').map((i) => i.creatorId)).size,
      reposters: new Set(unpaid.filter((i) => i.role === 'reposter').map((i) => i.creatorId)).size,
      statuses,
      urgency: urgencyFor(date, opts.today, remainingSar),
      names,
      items: dayItems,
    }
  })

  return {
    month: opts.month,
    start,
    end,
    today: opts.today,
    role: opts.role,
    spentSar,
    scheduledTotalSar,
    remainingScheduledSar,
    commissionEarnedSar: roundMoney(opts.commissionEarnedSar),
    commissionRecordedSar: roundMoney(opts.commissionRecordedSar),
    commissionDueSar: roundMoney(opts.commissionDueSar),
    days,
    unscheduled,
    undated,
    items: monthItems,
    payments: txns.filter((p) => p.paidOn >= start && p.paidOn <= end),
  }
}

export function dayFromModel(model: PaymentCalendarModel, date: string) {
  const cell = model.days.find((d) => d.date === date) ?? {
    date,
    inMonth: date >= model.start && date <= model.end,
    isToday: date === model.today,
    scheduledSar: 0,
    remainingSar: 0,
    paidSar: 0,
    recipientCount: 0,
    unpaidCount: 0,
    creators: 0,
    reposters: 0,
    statuses: [] as CalendarPayStatus[],
    urgency: 'none' as const,
    names: [] as string[],
    items: [] as SettledObligation[],
  }
  const actualPayments = model.payments.filter((p) => p.paidOn === date)
  const leftover = model.unscheduled.filter((p) => p.paidOn === date)
  const scheduledKeys = new Set(cell.items.map((i) => `${i.creatorId}:${i.contractId}`))
  const offSchedule = actualPayments.filter((p) => {
    const matchesToday =
      p.contractId != null
        ? scheduledKeys.has(`${p.creatorId}:${p.contractId}`)
        : cell.items.some((i) => i.creatorId === p.creatorId)
    return !matchesToday
  })
  const paidThatDaySar = roundMoney(actualPayments.reduce((s, p) => s + p.amountSar, 0))
  const dayCommissionSar = roundMoney(
    cell.items.reduce((s, i, idx, all) => {
      const firstOfContract = all.findIndex((x) => x.contractId === i.contractId) === idx
      return firstOfContract ? s + i.contractCommissionSar : s
    }, 0),
  )
  return {
    ...cell,
    leftover,
    offSchedule,
    actualPayments,
    paidThatDaySar,
    outstandingSar: cell.remainingSar,
    dayCommissionSar,
  }
}
