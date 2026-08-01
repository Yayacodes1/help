import { sql } from '@/lib/db'

/** Idempotent additive schema — safe to call on every admin load. */
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

  // One-time style migrate: seed a contract from legacy creator date fields if none exist.
  await sql`
    INSERT INTO contracts (creator_id, name, start_date, end_date)
    SELECT c.id, 'Initial contract', c.contract_start, c.contract_end
    FROM creators c
    WHERE c.contract_start IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM contracts x WHERE x.creator_id = c.id)
  `
}
