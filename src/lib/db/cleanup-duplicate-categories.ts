import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// One-shot fix: an earlier version of seed-categories.ts called
// `onConflictDoNothing` against the (household_id, key) unique index, but
// Postgres treats NULL as distinct in unique constraints by default — so
// system categories (household_id IS NULL) never tripped the conflict and
// re-running the seed inserted full duplicates.
//
// This script:
//   1. Finds duplicate system-category keys
//   2. Picks the oldest row per key as the survivor
//   3. Repoints transactions.category_id and recurring_rules.category_id
//      from losers → survivor
//   4. Deletes the losers
//
// Safe to re-run; if no duplicates are found, it does nothing.
async function main() {
  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  const dupes = await db.execute(sql`
    WITH ranked AS (
      SELECT
        id,
        key,
        ROW_NUMBER() OVER (
          PARTITION BY key
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM categories
      WHERE household_id IS NULL
    )
    SELECT
      l.id AS loser_id,
      w.id AS winner_id,
      l.key
    FROM ranked l
    JOIN ranked w ON l.key = w.key AND w.rn = 1
    WHERE l.rn > 1
  `);

  // drizzle-orm's `execute` returns a result with `.rows` for postgres-js.
  type Row = { loser_id: string; winner_id: string; key: string };
  const rows: Row[] = (
    Array.isArray(dupes) ? dupes : ((dupes as unknown as { rows: Row[] }).rows ?? [])
  ) as Row[];

  if (rows.length === 0) {
    console.log('No duplicate system categories found. Nothing to do.');
    return;
  }

  console.log(`Found ${rows.length} duplicate row(s) across these keys:`);
  const byKey = new Map<string, number>();
  for (const r of rows) byKey.set(r.key, (byKey.get(r.key) ?? 0) + 1);
  for (const [k, n] of byKey) console.log(`  - ${k}: ${n} duplicate(s)`);

  // Repoint and delete in one transaction so a partial failure can't leave
  // the FKs pointing at a row we then delete.
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.execute(sql`
        UPDATE transactions
        SET category_id = ${r.winner_id}
        WHERE category_id = ${r.loser_id}
      `);
      await tx.execute(sql`
        UPDATE recurring_rules
        SET category_id = ${r.winner_id}
        WHERE category_id = ${r.loser_id}
      `);
      await tx.execute(sql`
        DELETE FROM categories
        WHERE id = ${r.loser_id}
      `);
    }
  });

  console.log(`Cleaned up ${rows.length} duplicate category row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
