/**
 * Two diagnostics:
 *   1. Recent unlinked income txs vs every income rule (per-predicate)
 *   2. Materialization status for every active+confirmed rule in the
 *      currently-active cycle. The dashboard shows a rule under "expected
 *      income" only when materialization returns isMaterialized=false.
 *
 * Run: npx tsx --tsconfig tsconfig.json src/scripts/diagnose-recurring-link.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import('@/lib/db');
  const { recurringRules, transactions, households } = await import(
    '@/lib/db/schema'
  );
  const { and, desc, eq, gt, isNull } = await import('drizzle-orm');
  const { getActiveBillingCycle } = await import('@/lib/cycles/billing-cycle');
  const { checkMaterialization } = await import('@/lib/cycles/materialization');

  console.log('========== UNLINKED INCOME TXs (recent) ==========');
  const recent = await db
    .select()
    .from(transactions)
    .where(and(gt(transactions.amount, '0'), isNull(transactions.recurringRuleId)))
    .orderBy(desc(transactions.date))
    .limit(5);

  for (const tx of recent) {
    console.log('--- TX -------------------------------------------------');
    console.log('id:', tx.id, 'date:', tx.date, 'amount:', tx.amount);
    console.log(
      'normalizedDescription:',
      JSON.stringify(tx.normalizedDescription),
    );
  }

  console.log('\n========== MATERIALIZATION (current cycle) ==========');
  // For each household: build current cycle, run checkMaterialization, print.
  const hh = await db.select().from(households);
  for (const h of hh) {
    const cycle = getActiveBillingCycle(h.billingCycleStartDay);
    console.log(`Household ${h.name} (${h.id})`);
    console.log(`  cycleStartDay: ${h.billingCycleStartDay}`);
    console.log(
      `  cycle.startDate: ${cycle.startDate.toISOString()} (${cycle.startDate.toString()})`,
    );
    console.log(
      `  cycle.endDate:   ${cycle.endDate.toISOString()} (${cycle.endDate.toString()})`,
    );
    console.log(
      `  startStr (used in SQL): ${cycle.startDate.toISOString().slice(0, 10)}`,
    );
    console.log(
      `  endStr   (used in SQL): ${cycle.endDate.toISOString().slice(0, 10)}`,
    );

    const rules = await db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.householdId, h.id),
          eq(recurringRules.isActive, true),
          eq(recurringRules.detectionStatus, 'confirmed'),
        ),
      );

    const mat = await checkMaterialization(
      h.id,
      rules,
      cycle.startDate,
      cycle.endDate,
    );

    for (const r of rules) {
      const m = mat.get(r.id);
      console.log(
        `  RULE ${r.name} (${r.type})  isMaterialized=${m?.isMaterialized}  reason=${m?.reason}  matched=${m?.matchedTransactionIds.join(',') || '-'}`,
      );

      // For unmaterialized: also show whether ANY tx exists with this
      // rule's recurringRuleId (regardless of date), so we know if the
      // window check or the FK is the issue.
      if (!m?.isMaterialized) {
        const any = await db
          .select({
            id: transactions.id,
            date: transactions.date,
            processedDate: transactions.processedDate,
            amount: transactions.amount,
          })
          .from(transactions)
          .where(eq(transactions.recurringRuleId, r.id))
          .orderBy(desc(transactions.date))
          .limit(3);
        if (any.length === 0) {
          console.log('    (no txs at all linked to this rule)');
        } else {
          for (const a of any) {
            console.log(
              `    linked tx: id=${a.id} date=${a.date} processedDate=${a.processedDate} amount=${a.amount}`,
            );
          }
        }
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
