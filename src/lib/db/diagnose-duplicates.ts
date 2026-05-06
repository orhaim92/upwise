import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// Read-only diagnostic: looser dedup key than the strict one in
// dedupe-transactions.ts. Groups by just (account, date, amount,
// raw_description) — drops processed_date and installment fields. For each
// group with > 1 row, prints what's actually differing across the rows.
//
// If this finds nothing, the user-perceived "duplicates" are different
// real-world transactions (same merchant, different days/amounts).
//
// If this finds groups, the differences printed (processed_date diffs,
// installment diffs, external_id diffs) tell us why strict dedup missed
// them and what looser key would catch them safely.
async function main() {
  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  type Row = {
    account_id: string;
    date: string;
    amount: string;
    raw_description: string | null;
    cnt: string;
    ids: string[];
    processed_dates: (string | null)[];
    installment_numbers: (number | null)[];
    installment_totals: (number | null)[];
    external_ids: string[];
    created_ats: string[];
  };

  const result = await db.execute<Row>(sql`
    SELECT
      account_id,
      date,
      amount,
      raw_description,
      count(*)::text AS cnt,
      array_agg(id ORDER BY created_at ASC) AS ids,
      array_agg(processed_date ORDER BY created_at ASC) AS processed_dates,
      array_agg(installment_number ORDER BY created_at ASC) AS installment_numbers,
      array_agg(installment_total ORDER BY created_at ASC) AS installment_totals,
      array_agg(external_id ORDER BY created_at ASC) AS external_ids,
      array_agg(created_at::text ORDER BY created_at ASC) AS created_ats
    FROM transactions
    GROUP BY account_id, date, amount, raw_description
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT 30
  `);

  const rows: Row[] = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows?: Row[] }).rows ?? [])
  ) as Row[];

  if (rows.length === 0) {
    console.log(
      'No near-duplicates found by (account, date, amount, raw_description).',
    );
    console.log(
      'The rows you are seeing are different real transactions — same merchant',
    );
    console.log(
      'but different days or amounts. Nothing to clean up at this layer.',
    );
    return;
  }

  console.log(
    `Found ${rows.length} near-duplicate group(s) (top 30 shown). What differs:`,
  );
  console.log('');

  for (const r of rows) {
    const desc = (r.raw_description ?? '').slice(0, 60);
    console.log(`▶ ${r.date} ${r.amount} "${desc}" — ${r.cnt} rows`);

    const distinctProcessed = new Set(
      r.processed_dates.map((d) => d ?? 'NULL'),
    );
    const distinctInstallNum = new Set(
      r.installment_numbers.map((n) => n ?? 'NULL'),
    );
    const distinctInstallTot = new Set(
      r.installment_totals.map((n) => n ?? 'NULL'),
    );
    const distinctExternalIds = new Set(r.external_ids);

    if (distinctProcessed.size > 1) {
      console.log(
        `   processed_date differs: ${Array.from(distinctProcessed).join(', ')}`,
      );
    }
    if (distinctInstallNum.size > 1 || distinctInstallTot.size > 1) {
      console.log(
        `   installment differs: number=${Array.from(distinctInstallNum).join(',')} total=${Array.from(distinctInstallTot).join(',')}`,
      );
    }
    if (distinctExternalIds.size > 1) {
      console.log(
        `   external_id differs: ${distinctExternalIds.size} distinct keys`,
      );
    }
    if (
      distinctProcessed.size === 1 &&
      distinctInstallNum.size === 1 &&
      distinctInstallTot.size === 1 &&
      distinctExternalIds.size === 1
    ) {
      console.log(`   ⚠ identical content but separate ids — true duplicate`);
    }

    console.log(
      `   created_at: ${r.created_ats.map((c) => c.slice(0, 19)).join(' | ')}`,
    );
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
