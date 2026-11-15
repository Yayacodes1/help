import 'server-only'
import { sql } from '@/lib/db'

/** Company default: pay before/at start, or after/at end. Ahmed sets this; anyone can change. */
export type DefaultPayWhen = 'upfront' | 'end'

export type PayDefaults = {
  when: DefaultPayWhen | null
  updatedBy: string | null
  updatedAt: string | null
}

export async function ensurePayDefaultsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS pay_defaults (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pay_when text,
      updated_by text,
      updated_at timestamptz
    )
  `
  await sql`
    INSERT INTO pay_defaults (id, pay_when, updated_by, updated_at)
    VALUES (1, NULL, NULL, NULL)
    ON CONFLICT (id) DO NOTHING
  `
}

export async function getPayDefaults(): Promise<PayDefaults> {
  await ensurePayDefaultsTable()
  const rows = (await sql`
    SELECT pay_when, updated_by, updated_at::text AS updated_at
    FROM pay_defaults
    WHERE id = 1
    LIMIT 1
  `) as Array<{ pay_when: string | null; updated_by: string | null; updated_at: string | null }>
  const row = rows[0]
  const when =
    row?.pay_when === 'upfront' || row?.pay_when === 'end' ? row.pay_when : null
  return {
    when,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

export async function setPayDefaults(
  when: DefaultPayWhen,
  updatedBy: string,
): Promise<PayDefaults> {
  await ensurePayDefaultsTable()
  await sql`
    INSERT INTO pay_defaults (id, pay_when, updated_by, updated_at)
    VALUES (1, ${when}, ${updatedBy}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      pay_when = EXCLUDED.pay_when,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `
  return getPayDefaults()
}

/** Resolve timing for a new/blank contract from Ahmed’s company default. */
export function timingFromDefaults(
  defaults: PayDefaults | null | undefined,
): DefaultPayWhen | null {
  return defaults?.when ?? null
}
