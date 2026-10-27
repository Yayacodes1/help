import 'server-only'
import { sql } from '@/lib/db'
import type { Contract } from '@/lib/db'
import { monthRange } from '@/lib/campaign'
import { getViewsLeaderboard } from '@/lib/analytics'
import { getCreatorCommissionSheets } from '@/lib/commission-data'
import type { DayProgress } from '@/lib/consistency'
import { formatDate, formatMoney, formatNumber, payCurrency } from '@/lib/format'
import type { createT } from '@/lib/i18n'
import {
  getContractComparisons,
  getConsistencyForCreators,
  type ContractCompareRow,
  type CreatorWithProject,
} from '@/lib/queries'

type T = ReturnType<typeof createT>

export type TeamMember = {
  person: CreatorWithProject
  paused: boolean
  currency: 'USD' | 'SAR'
  active: Contract | null
  currentStreak: number
  bestStreak: number
  hitRate: number
  hitDays: number
  partialDays: number
  missDays: number
  requiredDays: number
  /** Up to the last 14 scored days of the current contract, oldest first. */
  recent: DayProgress[]
  monthViews: number
  monthVideos: number
  /** Only loaded with `withMoney`. */
  activeCompare: ContractCompareRow | null
  bonusEarned: number | null
  bonusUnpaid: number | null
}

async function getTeamPeople(ids: number[]): Promise<CreatorWithProject[]> {
  if (ids.length === 0) return []
  return (await sql`
    SELECT c.id, c.name, c.token, c.project_id, c.created_at, c.role, c.pay_currency,
           c.biweekly_amount::float AS biweekly_amount,
           c.goal_instagram, c.goal_tiktok, c.platforms,
           c.contract_start::text AS contract_start,
           c.contract_end::text AS contract_end,
           c.last_paid_at::text AS last_paid_at,
           c.pay_every_days, c.notes, c.tiktok_username, c.instagram_username, c.login_platform,
           c.notek_tiktok_username, c.notek_instagram_username,
           c.miqat_tiktok_username, c.miqat_instagram_username,
           c.paused_at::text AS paused_at,
           p.name AS project_name
    FROM creators c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.id = ANY(${ids}::int[])
    ORDER BY c.role ASC, c.name ASC
  `) as CreatorWithProject[]
}

export async function getTeamMembers(
  ids: number[],
  today: string,
  opts: { withMoney?: boolean } = {},
): Promise<TeamMember[]> {
  const { start, end } = monthRange(today)
  const [people, monthRows] = await Promise.all([
    getTeamPeople(ids),
    ids.length === 0
      ? Promise.resolve([])
      : getViewsLeaderboard({ from: start, to: end, creatorIds: ids, limit: 1000 }),
  ])
  const monthById = new Map(monthRows.map((row) => [row.creator_id, row]))

  const packed = await getConsistencyForCreators(people, today)

  return Promise.all(
    people.map(async (person) => {
      const row = packed.get(person.id)
      const [comparisons, commission] = await Promise.all([
        opts.withMoney ? getContractComparisons(person, today) : Promise.resolve(null),
        opts.withMoney ? getCreatorCommissionSheets(person.id, today) : Promise.resolve(null),
      ])
      const consistency = row?.consistency
      const scored = (consistency?.days ?? []).filter((d) => d.date <= today && d.status !== 'future')
      const month = monthById.get(person.id)
      const allSheets = commission ? [...commission.sheets.map((s) => s.earnedSar), commission.outside.earnedSar] : []
      return {
        person,
        paused: person.paused_at != null,
        currency: payCurrency(person.role, person.pay_currency),
        active: row?.active ?? null,
        currentStreak: consistency?.currentStreak ?? 0,
        bestStreak: consistency?.bestStreak ?? 0,
        hitRate: consistency?.hitRate ?? 0,
        hitDays: consistency?.hitDays ?? 0,
        partialDays: consistency?.partialDays ?? 0,
        missDays: consistency?.missDays ?? 0,
        requiredDays: consistency?.requiredDays ?? 0,
        recent: scored.slice(-14),
        monthViews: month?.views ?? 0,
        monthVideos: month?.videos ?? 0,
        activeCompare: comparisons?.find((row) => row.isActive) ?? null,
        bonusEarned: commission ? Math.round(allSheets.reduce((sum, v) => sum + v, 0) * 100) / 100 : null,
        bonusUnpaid: commission
          ? Math.round(
              (commission.sheets.filter((s) => s.paidOn == null).reduce((sum, s) => sum + s.earnedSar, 0) +
                commission.outside.earnedSar) *
                100,
            ) / 100
          : null,
      }
    }),
  )
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function cadenceLabel(t: T, contract: Contract): string {
  return contract.base_pay_cadence === 'biweekly' ? t('leaderBiweekly') : t('leaderMonthly')
}

/** "5 SAR every 5,000 views" for the contract's views bonus, or null when not set. */
export function viewsBonusLine(t: T, contract: Pick<Contract, 'view_commission_amount' | 'views_threshold'>): string | null {
  if (contract.view_commission_amount == null) return null
  return `${formatMoney(Number(contract.view_commission_amount), 'SAR')} ${t('leaderEvery')} ${formatNumber(
    contract.views_threshold ?? 5000,
  )} ${t('views')}`
}

/** Plain-text summary a leader can paste to the admin. */
export function personReportLines(t: T, m: TeamMember): string[] {
  const role = m.person.role === 'reposter' ? t('reposterRole') : t('creatorRole')
  const lines = [
    `${m.person.name} (${role}) · ${m.person.project_name ?? t('bothProjects')}${m.paused ? ` · ${t('leaderPaused')}` : ''}`,
    `  ${t('consistency')}: ${pct(m.hitRate)} · ${t('currentStreak')} ${m.currentStreak} · ${t('bestStreak')} ${m.bestStreak} · ${m.missDays}✗ ${m.partialDays}½`,
    `  ${t('leaderMonthViews')}: ${formatNumber(m.monthViews)} (${m.monthVideos} ${t('videos').toLowerCase()})`,
  ]
  const contract = m.active
  if (!contract) {
    lines.push(`  ${t('contracts')}: ${t('noContractSet')}`)
    return lines
  }
  const compare = m.activeCompare
  const dates = `${formatDate(contract.start_date)} → ${contract.end_date ? formatDate(contract.end_date) : t('openEnded')}`
  const progress = compare
    ? ` · ${compare.videoCount}${compare.targetTotal > 0 ? `/${compare.targetTotal}` : ''} ${t('videos').toLowerCase()}`
    : ''
  lines.push(`  ${t('contracts')}: ${contract.name} (${dates})${progress}`)
  const base = Number(contract.base_amount) || 0
  if (base > 0 || compare) {
    const money = (n: number) => formatMoney(n, m.currency)
    const parts = [`${t('leaderAgreed')}: ${money(base)} ${cadenceLabel(t, contract)}`]
    if (compare) {
      parts.push(`${t('totalPaid')} ${money(compare.paidAmount)}`)
      parts.push(compare.balance > 0.009 ? `${t('stillDue')} ${money(compare.balance)}` : t('leaderSettled'))
    }
    lines.push(`  ${parts.join(' · ')}`)
  }
  const bonus: string[] = []
  if (contract.commission_amount != null) {
    bonus.push(`${t('leaderBonusFlat')} ${formatMoney(Number(contract.commission_amount), m.currency)}`)
  }
  const viewsBonus = viewsBonusLine(t, contract)
  if (viewsBonus) bonus.push(`${t('leaderBonusViews')} ${viewsBonus}`)
  if (m.bonusEarned != null && m.bonusEarned > 0) {
    bonus.push(`${t('leaderBonusEarned')} ${formatMoney(m.bonusEarned, 'SAR')}`)
  }
  if (m.bonusUnpaid != null && m.bonusUnpaid > 0) {
    bonus.push(`${t('leaderBonusUnpaid')} ${formatMoney(m.bonusUnpaid, 'SAR')}`)
  }
  if (bonus.length > 0) lines.push(`  ${t('leaderBonus')}: ${bonus.join(' · ')}`)
  return lines
}

export function teamReport(t: T, leaderName: string, today: string, members: TeamMember[]): string {
  const creators = members.filter((m) => m.person.role === 'creator').length
  const reposters = members.length - creators
  const views = members.reduce((sum, m) => sum + m.monthViews, 0)
  const header = [
    `${t('leaderDashboard')} — ${leaderName} — ${today}`,
    `${t('roleFilterCreators')} ${creators} · ${t('roleFilterReposters')} ${reposters} · ${t('leaderMonthViews')} ${formatNumber(views)}`,
  ]
  const body = members.flatMap((m, i) => ['', `${i + 1}) ${personReportLines(t, m).join('\n')}`])
  return [...header, ...body].join('\n')
}
