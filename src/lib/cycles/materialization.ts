import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  cycleSkips,
  recurringRules,
  transactions,
} from '@/lib/db/schema';

export type MaterializationCheck = {
  ruleId: string;
  isMaterialized: boolean;
  reason: 'fk_link' | 'pattern_match' | 'user_skip' | 'not_yet';
  matchedTransactionIds: string[];
};

// For each recurring rule, decide whether it has already "happened" in the
// given cycle. A rule is materialized if ANY of:
//   1. A transaction in the cycle is FK-linked via recurring_rule_id
//   2. A transaction in the cycle matches the rule's pattern + amount tolerance
//   3. The user has marked the rule skipped for this cycle (counts as
//      materialized — contributes zero to the math)
//
// On a path-2 hit, we persist the FK link as a side effect so future calls
// hit path 1 directly.
export async function checkMaterialization(
  householdId: string,
  rules: Array<typeof recurringRules.$inferSelect>,
  cycleStart: Date,
  cycleEnd: Date,
): Promise<Map<string, MaterializationCheck>> {
  const startStr = cycleStart.toISOString().slice(0, 10);
  const endStr = cycleEnd.toISOString().slice(0, 10);

  const out = new Map<string, MaterializationCheck>();

  // Path 3: user-skipped rules for this cycle
  const skips = await db
    .select({ recurringRuleId: cycleSkips.recurringRuleId })
    .from(cycleSkips)
    .where(
      and(
        eq(cycleSkips.householdId, householdId),
        eq(cycleSkips.cycleStartDate, startStr),
      ),
    );
  const skippedIds = new Set(skips.map((s) => s.recurringRuleId));

  for (const rule of rules) {
    if (skippedIds.has(rule.id)) {
      out.set(rule.id, {
        ruleId: rule.id,
        isMaterialized: true,
        reason: 'user_skip',
        matchedTransactionIds: [],
      });
      continue;
    }

    // Path 1: FK match.
    // A tx counts as "in this cycle" for materialization purposes if EITHER
    // the swipe date OR the bill date (processedDate, for CC txs) falls in
    // the cycle window. This covers both:
    //   - "I paid via the recent CC bill" (Disney+: swipe 06.04 in prev cycle,
    //     bill 10.04 in current cycle → matches via processedDate)
    //   - "I just swiped the card this month" (חשמל bimonthly: swipe 20.04 in
    //     current cycle, bill 10.05 in next cycle → matches via date)
    // Errs on the side of "materialized" — better for user trust than
    // double-counting an already-committed expense.
    const fkMatches = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.recurringRuleId, rule.id),
          sql`(
            (${transactions.date} >= ${startStr} AND ${transactions.date} <= ${endStr})
            OR
            (${transactions.processedDate} IS NOT NULL
             AND ${transactions.processedDate} >= ${startStr}
             AND ${transactions.processedDate} <= ${endStr})
          )`,
          eq(transactions.isInternalTransfer, false),
          eq(transactions.isAggregatedCharge, false),
        ),
      );

    if (fkMatches.length > 0) {
      out.set(rule.id, {
        ruleId: rule.id,
        isMaterialized: true,
        reason: 'fk_link',
        matchedTransactionIds: fkMatches.map((m) => m.id),
      });
      continue;
    }

    // Path 2: pattern + amount match (transactions that "should have been" linked but weren't)
    const expected = Number(rule.expectedAmount);
    const tolerance = Number(rule.amountTolerancePct) / 100;
    const minAmount = expected * (1 - tolerance);
    const maxAmount = expected * (1 + tolerance);

    if (rule.matchPattern) {
      const patternMatches = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, householdId),
            sql`(
              (${transactions.date} >= ${startStr} AND ${transactions.date} <= ${endStr})
              OR
              (${transactions.processedDate} IS NOT NULL
               AND ${transactions.processedDate} >= ${startStr}
               AND ${transactions.processedDate} <= ${endStr})
            )`,
            eq(transactions.isInternalTransfer, false),
            eq(transactions.isAggregatedCharge, false),
            eq(transactions.normalizedDescription, rule.matchPattern),
            rule.type === 'expense'
              ? sql`${transactions.amount} < 0`
              : sql`${transactions.amount} > 0`,
            sql`abs(${transactions.amount}) BETWEEN ${minAmount.toFixed(2)} AND ${maxAmount.toFixed(2)}`,
          ),
        );

      if (patternMatches.length > 0) {
        // Side effect: persist FK link so future calls hit Path 1 directly.
        // Use IN(...) with sql.join — drizzle's sql tag wraps a JS array as
        // a record type; ANY(...) with that errors as "cannot cast record to uuid[]".
        const ids = patternMatches.map((m) => m.id);
        const inList = sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        );
        await db
          .update(transactions)
          .set({ recurringRuleId: rule.id })
          .where(sql`id IN (${inList})`);

        out.set(rule.id, {
          ruleId: rule.id,
          isMaterialized: true,
          reason: 'pattern_match',
          matchedTransactionIds: ids,
        });
        continue;
      }
    }

    out.set(rule.id, {
      ruleId: rule.id,
      isMaterialized: false,
      reason: 'not_yet',
      matchedTransactionIds: [],
    });
  }

  return out;
}
