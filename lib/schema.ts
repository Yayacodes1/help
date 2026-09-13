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
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'creator'`
  await sql`
    UPDATE creators
    SET role = 'creator'
    WHERE role IS NULL OR role NOT IN ('creator', 'reposter')
  `

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

  // Why a views lookup failed (cleared on success).
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS views_error text`
  // When TikTok/IG says the video went live (from TikHub). Display + optional video_date source.
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS platform_posted_at timestamptz`

  // Posted time is server-owned. Creators (and later edits) cannot change it.
  try {
    await sql`
      CREATE OR REPLACE FUNCTION lock_submission_timing()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        NEW.created_at := OLD.created_at;
        NEW.video_date := OLD.video_date;
        RETURN NEW;
      END;
      $fn$
    `
    await sql`DROP TRIGGER IF EXISTS submissions_lock_timing ON submissions`
    try {
      await sql`
        CREATE TRIGGER submissions_lock_timing
        BEFORE UPDATE ON submissions
        FOR EACH ROW
        EXECUTE FUNCTION lock_submission_timing()
      `
    } catch {
      await sql`
        CREATE TRIGGER submissions_lock_timing
        BEFORE UPDATE ON submissions
        FOR EACH ROW
        EXECUTE PROCEDURE lock_submission_timing()
      `
    }
  } catch {
    /* skip if this role cannot create triggers */
  }

  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS tiktok_username text`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS instagram_username text`
  await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS login_platform text`
  await sql`
    UPDATE creators
    SET tiktok_username = name
    WHERE (tiktok_username IS NULL OR btrim(tiktok_username) = '')
      AND name IS NOT NULL AND btrim(name) <> ''
  `
  await sql`
    UPDATE creators
    SET login_platform = 'tiktok'
    WHERE (login_platform IS NULL OR login_platform NOT IN ('instagram', 'tiktok'))
      AND tiktok_username IS NOT NULL AND btrim(tiktok_username) <> ''
  `
  await sql`
    UPDATE creators
    SET login_platform = 'instagram'
    WHERE (login_platform IS NULL OR login_platform NOT IN ('instagram', 'tiktok'))
      AND instagram_username IS NOT NULL AND btrim(instagram_username) <> ''
  `
  await sql`
    UPDATE creators
    SET login_platform = 'tiktok'
    WHERE login_platform IS NULL OR login_platform NOT IN ('instagram', 'tiktok')
  `
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS creators_tiktok_username_lower_idx
      ON creators (lower(tiktok_username))
      WHERE tiktok_username IS NOT NULL AND btrim(tiktok_username) <> ''
    `
  } catch {
    /* skip if duplicate handles already exist */
  }
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS creators_instagram_username_lower_idx
      ON creators (lower(instagram_username))
      WHERE instagram_username IS NOT NULL AND btrim(instagram_username) <> ''
    `
  } catch {
    /* skip if duplicate handles already exist */
  }

  await sql`
    CREATE TABLE IF NOT EXISTS schedule_breaks (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      days_added INTEGER NOT NULL DEFAULT 0,
      extended_contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS schedule_breaks_creator_id_idx ON schedule_breaks (creator_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS creator_strikes (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      strike_date DATE NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'active',
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS creator_strikes_creator_id_idx ON creator_strikes (creator_id)`
  await sql`CREATE INDEX IF NOT EXISTS creator_strikes_date_idx ON creator_strikes (strike_date)`
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS creator_strikes_creator_date_uidx
      ON creator_strikes (creator_id, strike_date)
    `
  } catch {
    /* skip if duplicates already exist */
  }

  await sql`
    CREATE TABLE IF NOT EXISTS commission_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      views_threshold INTEGER NOT NULL DEFAULT 5000,
      commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 5000,
      reel_count INTEGER NOT NULL DEFAULT 5,
      count_mode TEXT NOT NULL DEFAULT 'video'
    )
  `
  await sql`
    INSERT INTO commission_settings (id, views_threshold, commission_amount, reel_count, count_mode)
    VALUES (1, 5000, 5000, 5, 'video')
    ON CONFLICT (id) DO NOTHING
  `

  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS count_mode text`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS views_threshold integer`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS view_commission_amount numeric(12, 2)`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_reels integer`
  await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS base_pay_cadence text NOT NULL DEFAULT 'monthly'`
  await sql`
    UPDATE contracts
    SET base_pay_cadence = 'monthly'
    WHERE base_pay_cadence IS NULL OR base_pay_cadence = ''
  `

  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS batch_id text`
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS batch_index integer`
  await sql`CREATE INDEX IF NOT EXISTS submissions_batch_id_idx ON submissions (batch_id)`

  const { ensureStreakSettingsTable } = await import('@/lib/streak-epoch')
  await ensureStreakSettingsTable()
}
