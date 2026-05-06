import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// Diagnostic for the "same transaction shows up on two different days"
// pattern. Self-joins transactions on (account_id, amount, raw_description)
// across a ±1 day window — finds pairs whose dates differ by 1 day but are
// otherwise identical. Strong indicator that the bank shifted the
// transaction's date between two syncs (or our TZ-fix didn't catch
// historical rows synced before it landed).
//
// Read-only. Prints up to 50 pairs with the deltas in date / processed_date /
// created_at so we can see which sync produced which copy.
async function main() {
  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  type PairRow = {
    id1: string;
    id2: string;
    date1: string;
    date2: string;
    amount: string;
    raw_description: string | null;
    pd1: string | null;
    pd2: string | null;
    created1: string;
    created2: string;
  };

  const result = await db.execute<PairRow>(sql`
    SELECT
      a.id          AS id1,
      b.id          AS id2,
      a.date::text  AS date1,
      b.date::text  AS date2,
      a.amount::text AS amount,
      a.raw_description,
      a.processed_date::text AS pd1,
      b.processed_date::text AS pd2,
      a.created_at::text AS created1,
      b.created_at::text AS created2
    FROM transactions a
    INNER JOIN transactions b ON
      a.account_id = b.account_id
      AND a.amount = b.amount
      AND a.raw_description = b.raw_description
      AND a.id < b.id
      AND abs(extract(epoch from (a.date::timestamp - b.date::timestamp))) <= 86400
    WHERE a.amount < 0
      AND a.is_internal_transfer = false
      AND a.is_aggregated_charge = false
    ORDER BY a.created_at DESC
    LIMIT 50
  `);

  const rows: PairRow[] = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows?: PairRow[] }).rows ?? [])
  ) as PairRow[];

  if (rows.length === 0) {
    console.log(
      'No cross-day duplicates found. The rows you are seeing may be different real transactions.',
    );
    return;
  }

  console.log(`Found ${rows.length} suspicious pair(s) (top 50):\n`);
  for (const r of rows) {
    const desc = (r.raw_description ?? '').slice(0, 50);
    console.log(`▶ ${r.amount} "${desc}"`);
    console.log(`    row1: date=${r.date1.slice(0, 10)} pd=${r.pd1 ?? '—'} created=${r.created1.slice(0, 19)}`);
    console.log(`    row2: date=${r.date2.slice(0, 10)} pd=${r.pd2 ?? '—'} created=${r.created2.slice(0, 19)}`);
    console.log('');
  }

  // Quick summary: were the two rows created on different syncs?
  const sameSync = rows.filter((r) => {
    // Within 5 minutes = same sync run
    const t1 = new Date(r.created1).getTime();
    const t2 = new Date(r.created2).getTime();
    return Math.abs(t1 - t2) < 5 * 60 * 1000;
  }).length;
  const diffSync = rows.length - sameSync;
  console.log(
    `Of these: ${diffSync} pair(s) created in different sync runs (date shifted between syncs); ${sameSync} created in the same run.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
