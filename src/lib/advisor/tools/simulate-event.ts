import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { households, savingsGoals } from '@/lib/db/schema';
import { computeDailyAllowance } from '@/lib/cycles/daily-allowance';
import type { AdvisorContext } from '../wrap-tool';

type Args = {
  eventType:
    | 'vacation'
    | 'large_purchase'
    | 'income_change'
    | 'one_time_expense';
  date: string; // 'YYYY-MM-DD'
  amount: number; // positive shekels (signed handling done internally)
  description: string;
};

// Naive what-if: subtract the event amount from current `availableToSpend`
// and bucket the result into a recommendation. Doesn't project beyond the
// current cycle (good enough for "can I afford X this month"). For events
// further out, the model can call this and explain the limitation in
// natural language.
export async function simulateEvent(args: Args, ctx: AdvisorContext) {
  const [hh] = await db
    .select()
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);
  if (!hh) throw new Error('Household not found');

  const baseline = await computeDailyAllowance(
    ctx.householdId,
    hh.billingCycleStartDay,
  );

  const eventDate = new Date(args.date);
  const cycle = baseline.cycle;
  const inCurrentCycle =
    eventDate >= cycle.startDate && eventDate <= cycle.endDate;

  // Sum of monthly savings contributions, used to express the event cost
  // in "months of savings consumed" — a unit users intuitively understand.
  const goals = await db
    .select({ monthlyContribution: savingsGoals.monthlyContribution })
    .from(savingsGoals)
    .where(eq(savingsGoals.householdId, ctx.householdId));
  const monthlySavings = goals.reduce(
    (s, g) =>
      s + (g.monthlyContribution ? Number(g.monthlyContribution) : 0),
    0,
  );

  // Always treat the event as money OUT, regardless of sign the LLM passed.
  const eventImpact = -Math.abs(args.amount);
  const adjustedAvailable = baseline.availableToSpend + eventImpact;

  const ratio =
    baseline.availableToSpend > 0
      ? Math.abs(eventImpact) / baseline.availableToSpend
      : Infinity;

  let recommendation:
    | 'easily_afford'
    | 'tight_but_ok'
    | 'risky'
    | 'unaffordable';
  if (adjustedAvailable >= 1000) recommendation = 'easily_afford';
  else if (adjustedAvailable >= 0) recommendation = 'tight_but_ok';
  else if (adjustedAvailable >= -2000) recommendation = 'risky';
  else recommendation = 'unaffordable';

  const monthsOfSavings =
    monthlySavings > 0 ? Math.abs(eventImpact) / monthlySavings : null;

  return {
    event: {
      type: args.eventType,
      date: args.date,
      amount: args.amount,
      description: args.description,
      inCurrentCycle,
    },
    baseline: {
      currentBalance: baseline.currentTotalBalance,
      availableToSpend: baseline.availableToSpend,
      dailyAllowance: baseline.dailyAllowance,
    },
    afterEvent: {
      availableToSpend: adjustedAvailable,
      affordabilityRatio: ratio,
      recommendation,
    },
    savingsImpact: {
      monthlyContribution: monthlySavings,
      monthsOfSavingsConsumed: monthsOfSavings,
    },
  };
}
