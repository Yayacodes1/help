export const OUTREACH_STATUSES = ['open', 'negotiating', 'done', 'passed', 'closed'] as const
export type OutreachLeadStatus = (typeof OUTREACH_STATUSES)[number]

export const OUTREACH_SORTS = ['followers', 'likes', 'both'] as const
export type OutreachSort = (typeof OUTREACH_SORTS)[number]

export function parseOutreachSort(value: string | null | undefined): OutreachSort {
  return value === 'likes' || value === 'both' ? value : 'followers'
}

export function parseOutreachStatusFilter(
  value: string | null | undefined,
): OutreachLeadStatus | 'all' {
  if (value === 'open' || value === 'negotiating' || value === 'done' || value === 'passed' || value === 'closed') {
    return value
  }
  return 'all'
}

export function outreachStatusLabel(
  status: OutreachLeadStatus,
  negotiatorName: string | null,
): string {
  const name = negotiatorName?.trim() || 'Someone'
  if (status === 'negotiating') return `${name} is negotiating with them`
  if (status === 'done') return `Negotiation done by ${name}`
  if (status === 'passed') return 'Contacted, not closed'
  if (status === 'closed') return 'Closed · added as a creator'
  return 'Nobody has contacted them'
}

export function outreachGreeting(input: {
  name: string
  role: 'upper' | 'outreach'
  via: 'admin' | 'leader' | 'creator' | 'login'
}): string {
  if (input.via === 'creator' && input.role === 'outreach') {
    return `Hey, welcome back, reposter / outreach, ${input.name}`
  }
  if (input.role === 'outreach') {
    return `Hey, welcome back, outreach, ${input.name}`
  }
  return `Hey, welcome back, ${input.name}`
}

/** Username read from a profile screenshot. */
export function cleanOutreachUsername(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = raw.trim()
  value = value.replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, '')
  value = value.replace(/^@+/, '')
  value = value.split(/[/?#\s]/)[0] ?? ''
  value = value.replace(/[^a-zA-Z0-9._]/g, '')
  if (value.length < 2 || value.length > 80) return null
  return value
}

export function parseOutreachCount(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampCount(value)
  }
  const text = String(value).trim().toLowerCase().replace(/,/g, '').replace(/\s/g, '')
  const match = text.match(/^(\d+(?:\.\d+)?)([kmb])?$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2]
  const mult = unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : unit === 'b' ? 1_000_000_000 : 1
  return clampCount(amount * mult)
}

function clampCount(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  return Math.min(2_000_000_000, Math.round(value))
}

export function compareOutreachLeads(
  sort: OutreachSort,
  a: { followers: number | null; likes: number | null },
  b: { followers: number | null; likes: number | null },
): number {
  const key = (lead: { followers: number | null; likes: number | null }) => {
    const followers = lead.followers ?? 0
    const likes = lead.likes ?? 0
    if (sort === 'likes') return [lead.likes == null ? -1 : likes, followers] as const
    if (sort === 'followers') return [lead.followers == null ? -1 : followers, likes] as const
    return [followers + likes, followers, likes] as const
  }
  const left = key(a)
  const right = key(b)
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return right[i] - left[i]
  }
  return 0
}
