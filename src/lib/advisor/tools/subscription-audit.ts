import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules, transactions } from '@/lib/db/schema';
import type { AdvisorContext } from '../wrap-tool';

function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33;
    case 'monthly':
      return amount;
    case 'bimonthly':
      return amount / 2;
    case 'quarterly':
      return amount / 3;
    case 'semiannual':
      return amount / 6;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

// All confirmed recurring expenses, sorted by monthly load. For each, the
// most recent matched transaction date — `daysSinceLastCharge > expected
// frequency` is the heuristic for "subscription user might have forgotten".
//
// We don't make the "forgotten" call here — return raw data and let the
// LLM phrase the recommendation. Keeps this tool reusable across prompts.
export async function getSubscriptionAudit(
  _args: object,
  ctx: AdvisorContext,
) {
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, ctx.householdId),
        eq(recurringRules.type, 'expense'),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  const results = await Promise.all(
    rules.map(async (rule) => {
      const [lastTx] = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.recurringRuleId, rule.id),
            eq(transactions.householdId, ctx.householdId),
          ),
        )
        .orderBy(desc(transactions.date))
        .limit(1);

      const monthlyAmount = monthlyEquivalent(
        Number(rule.expectedAmount),
        rule.frequency,
      );

      return {
        name: rule.name,
        monthlyAmount,
        rawAmount: Number(rule.expectedAmount),
        frequency: rule.frequency,
        lastChargeDate: lastTx?.date ?? null,
        daysSinceLastCharge: lastTx?.date
          ? Math.floor(
              (Date.now() - new Date(lastTx.date).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null,
      };
    }),
  );

  results.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  return {
    items: results,
    totalMonthlySubscriptionLoad: results.reduce(
      (s, r) => s + r.monthlyAmount,
      0,
    ),
  };
}
