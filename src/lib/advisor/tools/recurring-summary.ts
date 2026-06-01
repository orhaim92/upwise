import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules } from '@/lib/db/schema';
import { monthlyEquivalent } from '@/lib/recurring/monthly-equivalent';
import type { AdvisorContext } from '../wrap-tool';

// All confirmed active recurring rules + a monthly-equivalent total so the
// model can answer "what's my fixed monthly burden" or "compare income vs
// expense" without doing the math itself.
export async function getRecurringSummary(
  _args: object,
  ctx: AdvisorContext,
) {
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, ctx.householdId),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  const incomes = rules.filter((r) => r.type === 'income');
  const expenses = rules.filter((r) => r.type === 'expense');

  const incomeTotal = incomes.reduce(
    (s, r) =>
      s + monthlyEquivalent(Number(r.expectedAmount), r.frequency),
    0,
  );
  const expenseTotal = expenses.reduce(
    (s, r) =>
      s + monthlyEquivalent(Number(r.expectedAmount), r.frequency),
    0,
  );

  return {
    incomes: incomes.map((r) => ({
      name: r.name,
      amount: Number(r.expectedAmount),
      frequency: r.frequency,
      monthlyEquivalent: monthlyEquivalent(
        Number(r.expectedAmount),
        r.frequency,
      ),
    })),
    expenses: expenses.map((r) => ({
      name: r.name,
      amount: Number(r.expectedAmount),
      frequency: r.frequency,
      monthlyEquivalent: monthlyEquivalent(
        Number(r.expectedAmount),
        r.frequency,
      ),
      remainingOccurrences: r.remainingOccurrences,
    })),
    monthlyIncomeTotal: incomeTotal,
    monthlyExpenseTotal: expenseTotal,
    monthlyNet: incomeTotal - expenseTotal,
  };
}
