import type { CountMode, Platform } from '@/lib/db'

/** House defaults: SAR paid per qualifying unit once views hit the threshold. */
export const HOUSE_COMMISSION = {
  viewsThreshold: 5000,
  /** SAR paid each time a video/batch hits the view mark */
  commissionAmount: 1000,
  /** Expected qualifying units in the deal (for “going to do”) */
  reelCount: 5,
  countMode: 'video' as CountMode,
}

export type CommissionTerms = {
  viewsThreshold: number
  commissionAmount: number
  reelCount: number
  countMode: CountMode
}

export type StandingBand = 'excellent' | 'good' | 'okay' | 'bad' | 'veryBad' | 'none'

export type Standing = {
  score: number | null
  band: StandingBand
  label: string
}

export type PerformanceUnit = {
  key: string
  views: number
  /** How many full view-blocks earned (e.g. floor(views / 5000)). */
  chunks: number
  qualified: boolean
  batchIndex: number | null
  platforms: Platform[]
  submissionIds: number[]
}

export type CommissionUnitLine = {
  key: string
  submissionIds: number[]
  platforms: Platform[]
  views: number
  /** Paid view-blocks (each = one viewsThreshold). */
  chunks: number
  qualified: boolean
  commissionSar: number
  batchIndex: number | null
  videoDate: string | null
  urls: string[]
}

export type PerformanceRow = {
  creatorId: number
  name: string
  role: string
  views: number
  videos: number
  units: number
  qualifiedUnits: number
  commissionEarned: number
  commissionAssigned: boolean
  paid: number
  costPer1k: number | null
  viewsPerDollar: number | null
  vsGroup: number | null
  viewsScore: number | null
  commissionScore: number | null
  spendScore: number | null
  standing: Standing
  rank: number | null
  terms: CommissionTerms | null
}

export type CommissionBoard = {
  from: string
  to: string
  settings: CommissionTerms
  dealCostPer1k: number
  groupCostPer1k: number | null
  totals: {
    people: number
    ranked: number
    views: number
    paid: number
    commissionEarned: number
    qualifiedUnits: number
    costPer1k: number | null
  }
  rows: PerformanceRow[]
  leaderboard: PerformanceRow[]
}

export type SubmissionUnitInput = {
  id: number
  platform: Platform
  views: number
  batch_id: string | null
  batch_index: number | null
}

export type ContractTermsInput = {
  count_mode: CountMode | null
  views_threshold: number | null
  view_commission_amount: number | null
  commission_reels: number | null
}

export function normalizeCountMode(value: string | null | undefined): CountMode | null {
  if (value === 'video' || value === 'batch') return value
  return null
}

/** Commission only runs after you set SAR pay on the contract. */
export function hasAssignedCommission(
  contract: ContractTermsInput | null | undefined,
): boolean {
  return contract?.view_commission_amount != null
}

/**
 * Resolve deal terms for a contract. Returns null until SAR pay is assigned —
 * house settings never auto-apply on their own.
 */
export function resolveTerms(
  contract: ContractTermsInput | null | undefined,
  settings: CommissionTerms,
): CommissionTerms | null {
  if (!hasAssignedCommission(contract)) return null
  const threshold = contract?.views_threshold
  const amount = contract!.view_commission_amount!
  const reels = contract?.commission_reels
  const mode = normalizeCountMode(contract?.count_mode)
  return {
    viewsThreshold:
      threshold != null && threshold > 0 ? Math.floor(threshold) : settings.viewsThreshold,
    commissionAmount: Math.max(0, amount),
    reelCount: reels != null && reels > 0 ? Math.floor(reels) : settings.reelCount,
    countMode: mode ?? settings.countMode,
  }
}

/** SAR paid for one full view-block (e.g. every 5,000 views). */
export function commissionPerUnit(terms: CommissionTerms): number {
  return roundMoney(terms.commissionAmount)
}

/** How many full threshold blocks a video/batch has earned. */
export function viewChunks(views: number, threshold: number): number {
  const floor = Math.max(0, Math.floor(threshold))
  if (floor <= 0) return 0
  return Math.max(0, Math.floor(Math.max(0, views) / floor))
}

function roundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100
}

export type CommissionEstimate = {
  did: number
  goingToDo: number
  recorded: number
  payNow: number
  views: number
  units: number
  qualifiedUnits: number
  remainingUnits: number
  contractCount: number
}

export type CommissionEstimateOption = {
  id: number
  creatorId: number
  creatorName: string
  name: string
  startDate: string
  endDate: string | null
  isActive: boolean
}

/** View-based commission for one contract window. Null terms → $0 commission. */
export function estimateContractCommission(input: {
  terms: CommissionTerms | null
  submissions: SubmissionUnitInput[]
  recorded: number
}): Omit<CommissionEstimate, 'contractCount'> {
  const recorded = roundMoney(input.recorded)
  if (!input.terms) {
    const units = buildUnits(input.submissions, 'video')
    return {
      did: 0,
      goingToDo: 0,
      recorded,
      payNow: 0,
      views: units.reduce((sum, u) => sum + u.views, 0),
      units: units.length,
      qualifiedUnits: 0,
      remainingUnits: 0,
    }
  }
  const units = qualifyUnits(
    buildUnits(input.submissions, input.terms.countMode),
    input.terms.viewsThreshold,
  )
  const qualifiedUnits = units.reduce((sum, u) => sum + u.chunks, 0)
  const perUnit = commissionPerUnit(input.terms)
  const did = roundMoney(qualifiedUnits * perUnit)
  const expectedPot = roundMoney(perUnit * Math.max(1, input.terms.reelCount))
  const goingToDo = roundMoney(Math.max(did, expectedPot))
  const remainingUnits = Math.max(0, input.terms.reelCount - qualifiedUnits)
  return {
    did,
    goingToDo,
    recorded,
    payNow: roundMoney(Math.max(0, did - recorded)),
    views: units.reduce((sum, u) => sum + u.views, 0),
    units: units.length,
    qualifiedUnits,
    remainingUnits,
  }
}

export function sumEstimates(parts: CommissionEstimate[]): CommissionEstimate {
  if (parts.length === 0) {
    return {
      did: 0,
      goingToDo: 0,
      recorded: 0,
      payNow: 0,
      views: 0,
      units: 0,
      qualifiedUnits: 0,
      remainingUnits: 0,
      contractCount: 0,
    }
  }
  return {
    did: roundMoney(parts.reduce((s, p) => s + p.did, 0)),
    goingToDo: roundMoney(parts.reduce((s, p) => s + p.goingToDo, 0)),
    recorded: roundMoney(parts.reduce((s, p) => s + p.recorded, 0)),
    payNow: roundMoney(parts.reduce((s, p) => s + p.payNow, 0)),
    views: parts.reduce((s, p) => s + p.views, 0),
    units: parts.reduce((s, p) => s + p.units, 0),
    qualifiedUnits: parts.reduce((s, p) => s + p.qualifiedUnits, 0),
    remainingUnits: parts.reduce((s, p) => s + p.remainingUnits, 0),
    contractCount: parts.reduce((s, p) => s + (p.contractCount || 1), 0),
  }
}

/** SAR paid for 1,000 views if each unit hits the threshold exactly. */
export function dealCostPer1k(terms: CommissionTerms): number {
  const views = Math.max(1, terms.viewsThreshold)
  return (commissionPerUnit(terms) / views) * 1000
}

export function buildUnits(
  submissions: SubmissionUnitInput[],
  countMode: CountMode,
): PerformanceUnit[] {
  if (countMode !== 'batch') {
    return submissions.map((s) => ({
      key: `v-${s.id}`,
      views: Math.max(0, s.views || 0),
      chunks: 0,
      qualified: false,
      batchIndex: null,
      platforms: [s.platform],
      submissionIds: [s.id],
    }))
  }

  const groups = new Map<string, SubmissionUnitInput[]>()
  let loose = 0
  for (const s of submissions) {
    const key = s.batch_id?.trim() ? `b-${s.batch_id}` : `loose-${++loose}-${s.id}`
    const list = groups.get(key) ?? []
    list.push(s)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([key, list]) => {
    const views = list.reduce((sum, s) => sum + Math.max(0, s.views || 0), 0)
    const platforms = [...new Set(list.map((s) => s.platform))]
    const batchIndex = list.find((s) => s.batch_index != null)?.batch_index ?? null
    return {
      key,
      views,
      chunks: 0,
      qualified: false,
      batchIndex,
      platforms,
      submissionIds: list.map((s) => s.id),
    }
  })
}

export type SubmissionDetailInput = SubmissionUnitInput & {
  video_date?: string | null
  url?: string | null
}

/** Per-unit commission lines — only videos/batches that earned at least one view-block. */
export function buildCommissionUnitLines(input: {
  terms: CommissionTerms | null
  submissions: SubmissionDetailInput[]
}): CommissionUnitLine[] {
  if (!input.terms) return []
  const units = qualifyUnits(
    buildUnits(input.submissions, input.terms.countMode),
    input.terms.viewsThreshold,
  )
  const perUnit = commissionPerUnit(input.terms)
  const byId = new Map(input.submissions.map((s) => [s.id, s]))

  return units
    .filter((u) => u.chunks > 0)
    .map((u) => {
      const details = u.submissionIds.map((id) => byId.get(id)).filter(Boolean) as SubmissionDetailInput[]
      const dates = details
        .map((d) => d.video_date)
        .filter((d): d is string => Boolean(d))
        .sort()
      return {
        key: u.key,
        submissionIds: u.submissionIds,
        platforms: u.platforms,
        views: u.views,
        chunks: u.chunks,
        qualified: true,
        commissionSar: roundMoney(u.chunks * perUnit),
        batchIndex: u.batchIndex,
        videoDate: dates[0] ?? null,
        urls: details.map((d) => d.url).filter((url): url is string => Boolean(url)),
      }
    })
    .sort((a, b) => {
      if (b.commissionSar !== a.commissionSar) return b.commissionSar - a.commissionSar
      if (b.views !== a.views) return b.views - a.views
      return (b.videoDate ?? '').localeCompare(a.videoDate ?? '')
    })
}

export function qualifyUnits(units: PerformanceUnit[], threshold: number): PerformanceUnit[] {
  return units.map((u) => {
    const chunks = viewChunks(u.views, threshold)
    return { ...u, chunks, qualified: chunks > 0 }
  })
}

export function standingBand(score: number | null): StandingBand {
  if (score == null) return 'none'
  if (score >= 9) return 'excellent'
  if (score >= 7) return 'good'
  if (score >= 5) return 'okay'
  if (score >= 3) return 'bad'
  return 'veryBad'
}

export function standingLabel(band: StandingBand): string {
  switch (band) {
    case 'excellent':
      return 'Excellent'
    case 'good':
      return 'Good'
    case 'okay':
      return 'Okay'
    case 'bad':
      return 'Bad'
    case 'veryBad':
      return 'Very bad'
    default:
      return 'No data'
  }
}

export function makeStanding(score: number | null): Standing {
  const band = standingBand(score)
  return { score, band, label: standingLabel(band) }
}

/** Higher ratio vs a "good" target (1.0 = hitting the deal) → higher score. */
export function scoreVsTarget(actual: number, target: number): number | null {
  if (target <= 0) return null
  if (actual <= 0) return 1
  const pct = actual / target
  if (pct >= 2.2) return 10
  if (pct >= 1.7) return 9
  if (pct >= 1.35) return 8
  if (pct >= 1) return 7
  if (pct >= 0.8) return 6
  if (pct >= 0.6) return 5
  if (pct >= 0.4) return 4
  if (pct >= 0.25) return 3
  if (pct >= 0.12) return 2
  return 1
}

/**
 * Lower cost-per-1k than the benchmark is better.
 * ratio = person / benchmark. 1.0 = average / on deal.
 */
export function scoreCostEfficiency(costPer1k: number, benchmark: number): number | null {
  if (benchmark <= 0) return null
  const ratio = costPer1k / benchmark
  if (ratio <= 0.35) return 10
  if (ratio <= 0.5) return 9
  if (ratio <= 0.7) return 8
  if (ratio <= 0.9) return 7
  if (ratio <= 1.1) return 6
  if (ratio <= 1.35) return 5
  if (ratio <= 1.7) return 4
  if (ratio <= 2.2) return 3
  if (ratio <= 3) return 2
  return 1
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function costPer1k(paid: number, views: number): number | null {
  if (paid <= 0 || views <= 0) return null
  return (paid / views) * 1000
}

export function scorePerson(input: {
  views: number
  qualifiedUnits: number
  paid: number
  terms: CommissionTerms | null
  costBenchmark: number
}): {
  viewsScore: number | null
  commissionScore: number | null
  spendScore: number | null
  standing: Standing
  costPer1k: number | null
  viewsPerDollar: number | null
} {
  const terms = input.terms
  const viewsScore =
    terms != null
      ? scoreVsTarget(input.views, terms.reelCount * terms.viewsThreshold)
      : null
  const commissionScore =
    terms != null ? scoreVsTarget(input.qualifiedUnits, terms.reelCount) : null
  const cpk = costPer1k(input.paid, input.views)
  const spendScore =
    cpk != null ? scoreCostEfficiency(cpk, input.costBenchmark) : null
  const overall = average([viewsScore, commissionScore, spendScore])
  const score = overall == null ? null : Math.max(1, Math.min(10, Math.round(overall)))
  return {
    viewsScore,
    commissionScore,
    spendScore,
    standing: makeStanding(score),
    costPer1k: cpk,
    viewsPerDollar: input.paid > 0 && input.views > 0 ? input.views / input.paid : null,
  }
}

export function buildCommissionBoard(input: {
  from: string
  to: string
  settings: CommissionTerms
  people: Array<{
    creatorId: number
    name: string
    role: string
    paid: number
    submissions: SubmissionUnitInput[]
    contract: ContractTermsInput | null
  }>
}): CommissionBoard {
  const deal = dealCostPer1k(input.settings)
  const draft = input.people.map((person) => {
    const terms = resolveTerms(person.contract, input.settings)
    const countMode = terms?.countMode ?? 'video'
    const units = terms
      ? qualifyUnits(buildUnits(person.submissions, countMode), terms.viewsThreshold)
      : buildUnits(person.submissions, countMode).map((u) => ({ ...u, chunks: 0, qualified: false }))
    const views = units.reduce((sum, u) => sum + u.views, 0)
    const qualifiedUnits = units.reduce((sum, u) => sum + u.chunks, 0)
    const commissionEarned =
      terms != null
        ? Math.round(qualifiedUnits * commissionPerUnit(terms) * 100) / 100
        : 0
    return {
      creatorId: person.creatorId,
      name: person.name,
      role: person.role,
      views,
      videos: person.submissions.length,
      units: units.length,
      qualifiedUnits,
      commissionEarned,
      commissionAssigned: terms != null,
      paid: Math.max(0, person.paid),
      terms,
    }
  })

  const comparable = draft.filter((r) => r.paid > 0 && r.views > 0)
  const groupCostPer1k =
    comparable.length >= 2
      ? comparable.reduce((sum, r) => sum + (r.paid / r.views) * 1000, 0) / comparable.length
      : null
  const costBenchmark = groupCostPer1k ?? deal

  const scored: PerformanceRow[] = draft.map((row) => {
    const marks = scorePerson({
      views: row.views,
      qualifiedUnits: row.qualifiedUnits,
      paid: row.paid,
      terms: row.terms,
      costBenchmark,
    })
    const vsGroup =
      marks.costPer1k != null && costBenchmark > 0
        ? (costBenchmark - marks.costPer1k) / costBenchmark
        : null
    return {
      ...row,
      ...marks,
      vsGroup,
      rank: null,
    }
  })

  const ranked = [...scored]
    .filter((r) => r.views > 0)
    .sort((a, b) => {
      const as = a.standing.score ?? 0
      const bs = b.standing.score ?? 0
      if (bs !== as) return bs - as
      const ae = a.viewsPerDollar ?? 0
      const be = b.viewsPerDollar ?? 0
      if (be !== ae) return be - ae
      if (b.views !== a.views) return b.views - a.views
      return a.name.localeCompare(b.name)
    })
  const rankById = new Map<number, number>()
  ranked.forEach((row, i) => rankById.set(row.creatorId, i + 1))

  const rows = scored
    .map((row) => ({ ...row, rank: rankById.get(row.creatorId) ?? null }))
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank
      if (a.rank != null) return -1
      if (b.rank != null) return 1
      return a.name.localeCompare(b.name)
    })

  const totalViews = rows.reduce((sum, r) => sum + r.views, 0)
  const totalPaid = rows.reduce((sum, r) => sum + r.paid, 0)

  return {
    from: input.from,
    to: input.to,
    settings: input.settings,
    dealCostPer1k: deal,
    groupCostPer1k,
    totals: {
      people: rows.length,
      ranked: ranked.length,
      views: totalViews,
      paid: totalPaid,
      commissionEarned: rows.reduce((sum, r) => sum + r.commissionEarned, 0),
      qualifiedUnits: rows.reduce((sum, r) => sum + r.qualifiedUnits, 0),
      costPer1k: costPer1k(totalPaid, totalViews),
    },
    rows,
    leaderboard: ranked,
  }
}
