import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// One-shot: find and consolidate content-duplicate transactions.
//
// Why this is needed: sync.ts builds an externalKey from the scraper's
// `tx.externalId` PLUS content fields. If the bank reassigns identifiers
// between syncs (some Israeli scrapers do this — Mizrahi, Isracard, etc.),
// the (accountId, externalId) conflict target on insert doesn't fire and
// the same real-world transaction lands twice.
//
// Dedup key (the natural-content key for "this is the same transaction"):
//   accountId, date, processed_date, amount, raw_description,
//   installment_number, installment_total
//
// All seven matching = very high confidence same transaction. We keep the
// OLDEST row (by created_at) — it's the original, with whatever user-set
// fields (categoryId, isInternalTransfer, transferPartnerId, etc.) the user
// has accumulated against it. Newer dupes are typically un-modified copies
// from a re-sync.
//
// Run modes:
//   `--dry-run` (default) — just count, don't delete
//   `--commit`            — actually delete losers + repoint FKs
async function main() {
  const dryRun = !process.argv.includes('--commit');

  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  type DupeRow = {
    account_id: string;
    date: string;
    amount: string;
    raw_description: string | null;
    ids: string[];
    cnt: string;
  };

  const dupesResult = await db.execute<DupeRow>(sql`
    SELECT
      account_id,
      date,
      amount,
      raw_description,
      array_agg(id ORDER BY created_at ASC) AS ids,
      count(*)::text AS cnt
    FROM transactions
    GROUP BY
      account_id,
      date,
      processed_date,
      amount,
      raw_description,
      installment_number,
      installment_total
    HAVING count(*) > 1
  `);

  const dupes: DupeRow[] = (
    Array.isArray(dupesResult)
      ? dupesResult
      : ((dupesResult as unknown as { rows?: DupeRow[] }).rows ?? [])
  ) as DupeRow[];

  if (dupes.length === 0) {
    console.log('No content-duplicate transactions found. Nothing to do.');
    return;
  }

  let totalLosers = 0;
  for (const d of dupes) {
    totalLosers += d.ids.length - 1;
  }

  console.log(
    `Found ${dupes.length} duplicate group(s); ${totalLosers} loser row(s) to remove.`,
  );

  // Show a sample so the user can sanity-check before --commit.
  const sample = dupes.slice(0, 5);
  for (const d of sample) {
    const desc = (d.raw_description ?? '').slice(0, 50);
    console.log(
      `  • ${d.date} ${d.amount} "${desc}" → ${d.cnt} rows (keep ${d.ids[0]})`,
    );
  }
  if (dupes.length > sample.length) {
    console.log(`  … and ${dupes.length - sample.length} more group(s).`);
  }

  if (dryRun) {
    console.log('\nDry-run only. Re-run with `--commit` to actually delete.');
    return;
  }

  // Commit path: repoint transfer pairs (a deleted row may be referenced as
  // someone's transfer_partner_id) then delete losers. Single transaction so
  // a partial failure can't leave dangling FKs.
  await db.transaction(async (tx) => {
    for (const d of dupes) {
      const winner = d.ids[0];
      const losers = d.ids.slice(1);
      await tx.execute(sql`
        UPDATE transactions
        SET transfer_partner_id = ${winner}
        WHERE transfer_partner_id = ANY(${losers})
      `);
      await tx.execute(sql`
        DELETE FROM transactions
        WHERE id = ANY(${losers})
      `);
    }
  });

  console.log(`Deleted ${totalLosers} duplicate transaction(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
