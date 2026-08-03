import { sql } from '@/lib/db'

/** Idempotent additive schema — safe to call on every admin/creator load. */
export async function ensureCreatorTrackingColumns() {
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS contract_start date`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS contract_end date`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS last_paid_at date`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS pay_every_days integer NOT NULL DEFAULT 14`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS notes text`

  await sql`
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS contracts_creator_id_idx ON contracts (creator_id)`

  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS goal_instagram integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS goal_tiktok integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS target_instagram integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS target_tiktok integer NOT NULL DEFAULT 0`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS base_amount numeric(12, 2) NOT NULL DEFAULT 0`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_amount numeric(12, 2)`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS platforms text NOT NULL DEFAULT 'both'`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS platforms text NOT NULL DEFAULT 'both'`

  // Infer platform mode from existing quotas (TikTok-only / IG-only contracts).
  await sql`
    UPDATE contracts
    SET platforms = 'tiktok'
    WHERE platforms = 'both'
      AND COALESCE(goal_instagram, 0) = 0
      AND COALESCE(target_instagram, 0) = 0
      AND (COALESCE(goal_tiktok, 0) > 0 OR COALESCE(target_tiktok, 0) > 0)
  `
  await sql`
    UPDATE contracts
    SET platforms = 'instagram'
    WHERE platforms = 'both'
      AND COALESCE(goal_tiktok, 0) = 0
      AND COALESCE(target_tiktok, 0) = 0
      AND (COALESCE(goal_instagram, 0) > 0 OR COALESCE(target_instagram, 0) > 0)
  `
  await sql`
    UPDATE creators
    SET platforms = 'tiktok'
    WHERE platforms = 'both'
      AND COALESCE(goal_instagram, 0) = 0
      AND COALESCE(goal_tiktok, 0) > 0
  `
  await sql`
    UPDATE creators
    SET platforms = 'instagram'
    WHERE platforms = 'both'
      AND COALESCE(goal_tiktok, 0) = 0
      AND COALESCE(goal_instagram, 0) > 0
  `

  // Seed contract from legacy creator dates if needed.
  await sql`
    INSERT INTO contracts (creator_id, name, start_date, end_date, goal_instagram, goal_tiktok)
    SELECT c.id, 'Initial contract', c.contract_start, c.contract_end,
           c.goal_instagram, c.goal_tiktok
    FROM creators c
    WHERE c.contract_start IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.creator_id = c.id)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      paid_on DATE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS payments_creator_id_idx ON payments (creator_id)`
  await sql`CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON payments (paid_on)`

  // Link unattached payments to the contract that covers paid_on (or the latest one).
  await sql`
    UPDATE payments p
    SET contract_id = (
      SELECT c.id FROM contracts c
      WHERE c.creator_id = p.creator_id
        AND c.start_date <= p.paid_on
        AND (c.end_date IS NULL OR c.end_date >= p.paid_on)
      ORDER BY c.start_date DESC, c.id DESC
      LIMIT 1
    )
    WHERE p.contract_id IS NULL
      AND EXISTS (
        SELECT 1 FROM contracts c
        WHERE c.creator_id = p.creator_id
          AND c.start_date <= p.paid_on
          AND (c.end_date IS NULL OR c.end_date >= p.paid_on)
      )
  `
  await sql`
    UPDATE payments p
    SET contract_id = (
      SELECT c.id FROM contracts c
      WHERE c.creator_id = p.creator_id
      ORDER BY c.start_date DESC, c.id DESC
      LIMIT 1
    )
    WHERE p.contract_id IS NULL
      AND EXISTS (SELECT 1 FROM contracts c WHERE c.creator_id = p.creator_id)
  `
}
