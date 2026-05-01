import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import('@/lib/db');
  const { households } = await import('@/lib/db/schema');
  const { detectInternalTransfers } = await import(
    '@/lib/transactions/detect-transfers'
  );
  const { detectCreditCardAggregates } = await import(
    '@/lib/transactions/detect-cc-aggregates'
  );
  const { autoCategorizeTransactions } = await import(
    '@/lib/transactions/auto-categorize'
  );
  const { detectRecurringPatterns, persistDetectedPatterns } = await import(
    '@/lib/recurring/detect'
  );
  const { linkTransactionsToRules } = await import('@/lib/recurring/link');

  const allHouseholds = await db.select({ id: households.id }).from(households);

  for (const h of allHouseholds) {
    console.log(`\n→ Backfilling household ${h.id}`);

    const transfers = await detectInternalTransfers(h.id);
    console.log(`  transfers detected: ${transfers}`);

    const aggregates = await detectCreditCardAggregates(h.id);
    console.log(`  CC aggregates marked: ${aggregates}`);

    const categorized = await autoCategorizeTransactions(h.id);
    console.log(`  auto-categorized: ${categorized}`);

    const patterns = await detectRecurringPatterns(h.id);
    const persisted = await persistDetectedPatterns(h.id, patterns);
    console.log(
      `  new recurring suggestions: ${persisted} (sorted by confidence)`,
    );

    const linked = await linkTransactionsToRules(h.id);
    console.log(`  newly linked transactions: ${linked}`);
  }

  console.log('\nDone.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
