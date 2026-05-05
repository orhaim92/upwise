import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Apply user-learned categories to new transactions.
//
// For each uncategorized, non-user-modified transaction in the household,
// look up other transactions in the same household that share its
// `normalized_description` AND have been explicitly categorized by the user
// (`is_user_modified = true`). Apply the most-common category among those
// user choices.
//
// Conceptually this is the "dictionary" approach derived on the fly from
// existing data — no separate dictionary table to keep in sync. When the user
// re-categorizes, the next sync's lookup naturally reflects the change.
//
// Must run BEFORE the keyword-based RULES in autoCategorizeTransactions so
// per-household user choices win over the generic "שופרסל → groceries"-style
// rules. Idempotent. Never touches user-modified rows. Returns the count of
// transactions newly categorized.
export async function applyUserLearnedCategories(
  householdId: string,
): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    WITH user_choices AS (
      -- Per (description, category) pair: how many times the user has
      -- explicitly placed a row with this description into this category.
      SELECT
        normalized_description,
        category_id,
        count(*) AS hits
      FROM transactions
      WHERE household_id = ${householdId}
        AND is_user_modified = true
        AND category_id IS NOT NULL
        AND normalized_description IS NOT NULL
      GROUP BY normalized_description, category_id
    ),
    top_choices AS (
      -- DISTINCT ON picks the most-frequent category per description. Ties
      -- broken by category_id so results are stable across runs.
      SELECT DISTINCT ON (normalized_description)
        normalized_description,
        category_id
      FROM user_choices
      ORDER BY normalized_description, hits DESC, category_id
    )
    UPDATE transactions t
    SET category_id = tc.category_id
    FROM top_choices tc
    WHERE t.household_id = ${householdId}
      AND t.normalized_description = tc.normalized_description
      AND t.category_id IS NULL
      AND t.is_user_modified = false
    RETURNING t.id
  `);

  type Row = { id: string };
  const rows: Row[] = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows?: Row[] }).rows ?? [])
  ) as Row[];

  return rows.length;
}
