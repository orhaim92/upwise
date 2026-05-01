import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules, transactions } from '@/lib/db/schema';

export async function linkTransactionsToRules(
  householdId: string,
): Promise<number> {
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, householdId),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  let updated = 0;

  for (const rule of rules) {
    if (!rule.matchPattern) continue;

    const expected = Number(rule.expectedAmount);
    const tolerance = Number(rule.amountTolerancePct) / 100;
    const minAmount = expected * (1 - tolerance);
    const maxAmount = expected * (1 + tolerance);

    const sign = rule.type === 'expense' ? -1 : 1;

    const result = await db
      .update(transactions)
      .set({ recurringRuleId: rule.id })
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.recurringRuleId),
          eq(transactions.isInternalTransfer, false),
          eq(transactions.isAggregatedCharge, false),
          eq(transactions.normalizedDescription, rule.matchPattern),
          sql`abs(${transactions.amount}) BETWEEN ${minAmount.toFixed(2)} AND ${maxAmount.toFixed(2)}`,
          sign === -1
            ? sql`${transactions.amount} < 0`
            : sql`${transactions.amount} > 0`,
        ),
      )
      .returning({ id: transactions.id });

    updated += result.length;
  }

  return updated;
}
