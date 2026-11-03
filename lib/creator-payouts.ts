import 'server-only'
import { sql } from '@/lib/db'
import { ensureOnce } from '@/lib/ensure-once'
import { payCurrency } from '@/lib/format'
import { buildCreatorPaySchedule, resolvePayTiming } from '@/lib/payment-calendar-math'
import type {
  CreatorPayoutBoard,
  CreatorPayoutCandidate,
  CreatorPayoutRow,
  PayerGroup,
  PayoutMethod,
} from '@/lib/creator-payouts-types'

export type {
  CreatorPayoutBoard,
  CreatorPayoutCandidate,
  CreatorPayoutRow,
  PayerGroup,
  PayoutMethod,
} from '@/lib/creator-payouts-types'

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function asMethod(value: string | null | undefined): PayoutMethod | null {
  return value === 'paypal' || value === 'bank' ? value : null
}

function asGroup(value: string | null | undefined): PayerGroup {
  return value === 'ahmed' ? 'ahmed' : 'yahya'
}

function destinationFilled(opts: {
  method: PayoutMethod | null
  paypalEmail: string | null
  paypalUsername: string | null
  bankName: string | null
  accountHolderName: string | null
  iban: string | null
  phone: string | null
  city: string | null
}): boolean {
  if (opts.method === 'paypal') {
    return Boolean((opts.paypalEmail ?? '').trim() || (opts.paypalUsername ?? '').trim())
  }
  if (opts.method === 'bank') {
    return Boolean(
      (opts.bankName ?? '').trim() &&
        (opts.accountHolderName ?? '').trim() &&
        (opts.iban ?? '').trim() &&
        (opts.phone ?? '').trim() &&
        (opts.city ?? '').trim(),
    )
  }
  return false
}

export async function ensureCreatorPayoutTables() {
  return ensureOnce('creator_payouts_v1', async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS creator_payout_profiles (
        creator_id INTEGER PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
        payer_group TEXT NOT NULL DEFAULT 'yahya',
        method TEXT,
        paypal_email TEXT,
        paypal_username TEXT,
        bank_name TEXT,
        account_holder_name TEXT,
        iban TEXT,
        phone TEXT,
        city TEXT,
        base_amount numeric(12, 2),
        commission_amount numeric(12, 2),
        total_amount numeric(12, 2),
        currency TEXT,
        due_on DATE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS creator_payout_profiles_group_idx ON creator_payout_profiles (payer_group)`
  })
}

type ProfileRow = {
  creator_id: number
  payer_group: string
  method: string | null
  paypal_email: string | null
  paypal_username: string | null
  bank_name: string | null
  account_holder_name: string | null
  iban: string | null
  phone: string | null
  city: string | null
  base_amount: number | null
  commission_amount: number | null
  total_amount: number | null
  currency: string | null
  due_on: string | null
  updated_at: string | null
  updated_by: string | null
}

type CreatorPaySeed = {
  id: number
  name: string
  role: string
  pay_currency: string | null
  biweekly_amount: number | null
  contract_id: number | null
  contract_base: number | null
  contract_commission: number | null
  first_pay_on: string | null
  second_pay_on: string | null
  pay_timing: string | null
  start_date: string | null
  end_date: string | null
}

function nextDueFromSeed(seed: CreatorPaySeed, today: string): string | null {
  if (seed.first_pay_on && seed.first_pay_on >= today) return seed.first_pay_on
  if (seed.second_pay_on && seed.second_pay_on >= today) return seed.second_pay_on
  if (seed.first_pay_on) return seed.first_pay_on
  if (!seed.start_date) return null
  const timing = resolvePayTiming({
    stored: seed.pay_timing,
    startDate: seed.start_date,
    endDate: seed.end_date,
    paidOn: [],
    notes: [],
  })
  const slices = buildCreatorPaySchedule({
    startDate: seed.start_date,
    endDate: seed.end_date,
    timing,
    through: seed.end_date ?? today,
  })
  const upcoming = slices.find((slice) => slice.dueOn >= today)
  return upcoming?.dueOn ?? slices[0]?.dueOn ?? null
}

function defaultsFromSeed(seed: CreatorPaySeed, today: string) {
  const base = round2(
    seed.contract_base != null && seed.contract_base > 0
      ? seed.contract_base
      : Number(seed.biweekly_amount) || 0,
  )
  const commission = round2(Number(seed.contract_commission) || 0)
  const currency = payCurrency(seed.role, seed.pay_currency)
  return {
    baseAmount: base,
    commissionAmount: commission,
    totalAmount: round2(base + commission),
    currency,
    dueOn: nextDueFromSeed(seed, today),
  }
}

function buildRow(seed: CreatorPaySeed, profile: ProfileRow | null, today: string): CreatorPayoutRow {
  const defaults = defaultsFromSeed(seed, today)
  const method = asMethod(profile?.method)
  const paypalEmail = profile?.paypal_email?.trim() || null
  const paypalUsername = profile?.paypal_username?.trim() || null
  const bankName = profile?.bank_name?.trim() || null
  const accountHolderName = profile?.account_holder_name?.trim() || null
  const iban = profile?.iban?.trim() || null
  const phone = profile?.phone?.trim() || null
  const city = profile?.city?.trim() || null
  const overrideBase =
    profile?.base_amount == null ? null : round2(Number(profile.base_amount))
  const overrideCommission =
    profile?.commission_amount == null ? null : round2(Number(profile.commission_amount))
  const overrideTotal =
    profile?.total_amount == null ? null : round2(Number(profile.total_amount))
  const overrideCurrency =
    profile?.currency === 'USD' || profile?.currency === 'SAR' ? profile.currency : null
  const overrideDue = profile?.due_on || null

  const baseAmount = overrideBase ?? defaults.baseAmount
  const commissionAmount = overrideCommission ?? defaults.commissionAmount
  const totalAmount =
    overrideTotal ?? round2(baseAmount + commissionAmount)
  const currency = overrideCurrency ?? defaults.currency
  const dueOn = overrideDue ?? defaults.dueOn

  return {
    creatorId: seed.id,
    name: seed.name,
    role: seed.role,
    payerGroup: asGroup(profile?.payer_group),
    method,
    paypalEmail,
    paypalUsername,
    bankName,
    accountHolderName,
    iban,
    phone,
    city,
    baseAmount,
    commissionAmount,
    totalAmount,
    currency,
    dueOn,
    infoFilled: destinationFilled({
      method,
      paypalEmail,
      paypalUsername,
      bankName,
      accountHolderName,
      iban,
      phone,
      city,
    }),
    defaults,
    overrides: {
      baseAmount: overrideBase,
      commissionAmount: overrideCommission,
      totalAmount: overrideTotal,
      currency: overrideCurrency,
      dueOn: overrideDue,
    },
    updatedAt: profile?.updated_at ?? null,
    updatedBy: profile?.updated_by ?? null,
  }
}

async function loadSeeds(): Promise<CreatorPaySeed[]> {
  return (await sql`
    SELECT
      c.id,
      c.name,
      c.role,
      c.pay_currency,
      c.biweekly_amount::float AS biweekly_amount,
      ct.id AS contract_id,
      ct.base_amount::float AS contract_base,
      ct.commission_amount::float AS contract_commission,
      ct.first_pay_on::text AS first_pay_on,
      ct.second_pay_on::text AS second_pay_on,
      ct.pay_timing,
      ct.start_date::text AS start_date,
      ct.end_date::text AS end_date
    FROM creators c
    LEFT JOIN LATERAL (
      SELECT *
      FROM contracts x
      WHERE x.creator_id = c.id
      ORDER BY
        CASE WHEN x.end_date IS NULL OR x.end_date >= CURRENT_DATE THEN 0 ELSE 1 END,
        x.start_date DESC,
        x.id DESC
      LIMIT 1
    ) ct ON true
    WHERE c.paused_at IS NULL
    ORDER BY c.name ASC
  `) as CreatorPaySeed[]
}

async function loadProfiles(): Promise<Map<number, ProfileRow>> {
  const rows = (await sql`
    SELECT
      creator_id,
      payer_group,
      method,
      paypal_email,
      paypal_username,
      bank_name,
      account_holder_name,
      iban,
      phone,
      city,
      base_amount::float AS base_amount,
      commission_amount::float AS commission_amount,
      total_amount::float AS total_amount,
      currency,
      due_on::text AS due_on,
      updated_at::text AS updated_at,
      updated_by
    FROM creator_payout_profiles
  `) as ProfileRow[]
  return new Map(rows.map((row) => [row.creator_id, row]))
}

export async function loadCreatorPayoutBoard(today: string): Promise<CreatorPayoutBoard> {
  await ensureCreatorPayoutTables()
  const [seeds, profiles] = await Promise.all([loadSeeds(), loadProfiles()])
  const assigned: CreatorPayoutRow[] = []
  const candidates: CreatorPayoutCandidate[] = []

  for (const seed of seeds) {
    const profile = profiles.get(seed.id) ?? null
    if (!profile) {
      candidates.push({
        creatorId: seed.id,
        name: seed.name,
        role: seed.role,
        payerGroup: null,
      })
      continue
    }
    assigned.push(buildRow(seed, profile, today))
  }

  const yahya = assigned
    .filter((row) => row.payerGroup === 'yahya')
    .sort((a, b) => a.name.localeCompare(b.name))
  const ahmed = assigned
    .filter((row) => row.payerGroup === 'ahmed')
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    yahya,
    ahmed,
    candidates,
    filledCount: assigned.filter((row) => row.infoFilled).length,
    missingCount: assigned.filter((row) => !row.infoFilled).length,
  }
}

export async function assignCreatorToPayerGroup(opts: {
  creatorId: number
  payerGroup: PayerGroup
  updatedBy: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureCreatorPayoutTables()
  const id = Math.floor(Number(opts.creatorId))
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid creator.' }
  const group = asGroup(opts.payerGroup)
  const exists = (await sql`SELECT id FROM creators WHERE id = ${id} LIMIT 1`) as { id: number }[]
  if (!exists[0]) return { ok: false, error: 'Creator not found.' }

  await sql`
    INSERT INTO creator_payout_profiles (creator_id, payer_group, updated_at, updated_by)
    VALUES (${id}, ${group}, NOW(), ${opts.updatedBy})
    ON CONFLICT (creator_id) DO UPDATE SET
      payer_group = EXCLUDED.payer_group,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
  `
  return { ok: true }
}

export async function removeCreatorFromPayoutBoard(opts: {
  creatorId: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureCreatorPayoutTables()
  const id = Math.floor(Number(opts.creatorId))
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid creator.' }
  await sql`DELETE FROM creator_payout_profiles WHERE creator_id = ${id}`
  return { ok: true }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

function optionalMoney(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

export async function saveCreatorPayoutProfile(opts: {
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
  updatedBy: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureCreatorPayoutTables()
  const id = Math.floor(Number(opts.creatorId))
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid creator.' }
  const exists = (await sql`SELECT id FROM creators WHERE id = ${id} LIMIT 1`) as { id: number }[]
  if (!exists[0]) return { ok: false, error: 'Creator not found.' }

  const method = asMethod(opts.method)
  const dueOn =
    opts.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueOn) ? opts.dueOn : null
  const currency =
    opts.currency === 'USD' || opts.currency === 'SAR' ? opts.currency : null

  await sql`
    INSERT INTO creator_payout_profiles (
      creator_id, payer_group, method,
      paypal_email, paypal_username,
      bank_name, account_holder_name, iban, phone, city,
      base_amount, commission_amount, total_amount, currency, due_on,
      updated_at, updated_by
    )
    VALUES (
      ${id},
      ${asGroup(opts.payerGroup)},
      ${method},
      ${emptyToNull(opts.paypalEmail)},
      ${emptyToNull(opts.paypalUsername)},
      ${emptyToNull(opts.bankName)},
      ${emptyToNull(opts.accountHolderName)},
      ${emptyToNull(opts.iban)},
      ${emptyToNull(opts.phone)},
      ${emptyToNull(opts.city)},
      ${optionalMoney(opts.baseAmount)},
      ${optionalMoney(opts.commissionAmount)},
      ${optionalMoney(opts.totalAmount)},
      ${currency},
      ${dueOn},
      NOW(),
      ${opts.updatedBy}
    )
    ON CONFLICT (creator_id) DO UPDATE SET
      payer_group = EXCLUDED.payer_group,
      method = EXCLUDED.method,
      paypal_email = EXCLUDED.paypal_email,
      paypal_username = EXCLUDED.paypal_username,
      bank_name = EXCLUDED.bank_name,
      account_holder_name = EXCLUDED.account_holder_name,
      iban = EXCLUDED.iban,
      phone = EXCLUDED.phone,
      city = EXCLUDED.city,
      base_amount = EXCLUDED.base_amount,
      commission_amount = EXCLUDED.commission_amount,
      total_amount = EXCLUDED.total_amount,
      currency = EXCLUDED.currency,
      due_on = EXCLUDED.due_on,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
  `
  return { ok: true }
}
