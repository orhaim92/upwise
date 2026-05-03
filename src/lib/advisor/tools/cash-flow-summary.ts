import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { households } from '@/lib/db/schema';
import { computeDailyAllowance } from '@/lib/cycles/daily-allowance';
import type { AdvisorContext } from '../wrap-tool';

// Returns the same numbers the dashboard renders, structured for the LLM.
// All amounts are positive shekels (₪); `availableToSpend` and
// `dailyAllowance` may be negative if the user is over budget.
export async function getCashFlowSummary(
  _args: object,
  ctx: AdvisorContext,
) {
  const [hh] = await db
    .select()
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);
  if (!hh) throw new Error('Household not found');

  const allowance = await computeDailyAllowance(
    ctx.householdId,
    hh.billingCycleStartDay,
  );

  return {
    cycle: {
      start: allowance.cycle.startDate.toISOString().slice(0, 10),
      end: allowance.cycle.endDate.toISOString().slice(0, 10),
      daysRemaining: allowance.cycle.daysRemaining,
      daysTotal: allowance.cycle.daysTotal,
    },
    currentTotalBalance: allowance.currentTotalBalance,
    expectedRemainingIncome: allowance.expectedRemainingIncome,
    expectedRemainingRecurringExpenses:
      allowance.expectedRemainingRecurringExpenses,
    savingsCommitment: allowance.savingsCommitmentRemainingInCycle,
    manualOneTimeIncome: allowance.manualOneTimeIncome,
    manualOneTimeExpenses: allowance.manualOneTimeExpenses,
    availableToSpend: allowance.availableToSpend,
    dailyAllowance: allowance.dailyAllowance,
    incomeRealizedToDate: allowance.incomeRealizedToDate,
    expensesRealizedToDate: allowance.expensesRealizedToDate,
    isOverBudget: allowance.isOverBudget,
    isLowBalance: allowance.isLowBalance,
  };
}
