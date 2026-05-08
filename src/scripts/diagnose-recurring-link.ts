/**
 * Prints why the most-recent income transaction did NOT link to its
 * recurring rule. Compares the tx's normalized description and amount to
 * each active income rule, byte-for-byte, and reports the first failed
 * predicate per rule.
 *
 * Run: npx tsx --tsconfig tsconfig.json src/scripts/diagnose-recurring-link.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  // Dynamic imports so env is loaded before db/index.ts reads DATABASE_URL.
  const { db } = await import('@/lib/db');
  const { recurringRules, transactions } = await import('@/lib/db/schema');
  const { and, desc, eq, gt, isNull } = await import('drizzle-orm');

  const recent = await db
    .select()
    .from(transactions)
    .where(and(gt(transactions.amount, '0'), isNull(transactions.recurringRuleId)))
    .orderBy(desc(transactions.date))
    .limit(5);

  if (recent.length === 0) {
    console.log('No recent unlinked income transactions found.');
    return;
  }

  for (const tx of recent) {
    console.log('--- TX -------------------------------------------------');
    console.log('id:', tx.id);
    console.log('date:', tx.date, '/ processedDate:', tx.processedDate);
    console.log('amount:', tx.amount);
    console.log('description:', JSON.stringify(tx.description));
    console.log('rawDescription:', JSON.stringify(tx.rawDescription));
    console.log(
      'normalizedDescription:',
      JSON.stringify(tx.normalizedDescription),
    );
    if (tx.normalizedDescription) {
      console.log(
        '  bytes:',
        Array.from(tx.normalizedDescription)
          .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
          .join(' '),
      );
    }

    const rules = await db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.householdId, tx.householdId),
          eq(recurringRules.type, 'income'),
        ),
      );

    for (const r of rules) {
      console.log(`  RULE ${r.name} (${r.id})`);
      console.log('    isActive:', r.isActive);
      console.log('    detectionStatus:', r.detectionStatus);
      console.log('    matchPattern:', JSON.stringify(r.matchPattern));
      if (r.matchPattern) {
        console.log(
          '      bytes:',
          Array.from(r.matchPattern)
            .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
            .join(' '),
        );
      }
      console.log(
        '    expected:',
        r.expectedAmount,
        'tolerance%:',
        r.amountTolerancePct,
      );

      const expected = Number(r.expectedAmount);
      const tol = Number(r.amountTolerancePct) / 100;
      const min = expected * (1 - tol);
      const max = expected * (1 + tol);
      const amt = Math.abs(parseFloat(tx.amount));

      const checks = {
        active: r.isActive,
        confirmed: r.detectionStatus === 'confirmed',
        hasPattern: !!r.matchPattern,
        normalizedSet: !!tx.normalizedDescription,
        patternMatch:
          !!r.matchPattern &&
          tx.normalizedDescription === r.matchPattern,
        amountInRange: amt >= min && amt <= max,
        signCorrect: parseFloat(tx.amount) > 0, // income rule
      };
      console.log('    checks:', checks);
      const allPass = Object.values(checks).every(Boolean);
      console.log('    => WOULD LINK:', allPass);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
