import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { accounts, categories, households, transactions } from '@/lib/db/schema';
import { projectNextCycle } from '@/lib/cycles/billing-cycle';
import { resolveActiveBillingCycle } from '@/lib/cycles/resolve-cycle';
import { projectCycleRecurring } from '@/lib/cycles/cycle-preview';
import { effectiveCycleDateSql } from '@/lib/charts/effective-date';
import type { AdvisorContext } from '../wrap-tool';

// Forecast of what the user will actually pay in the NEXT billing cycle. This
// is the tool to use for "what's coming up next month" / "what did I skip"
// questions — NOT getRecurringSummary, which is a skip-blind, cycle-agnostic
// monthly-burden summary.
//
// Two sources are combined:
//   1. Recurring rules projected into the next cycle, WITH the user's per-cycle
//      skips applied (skipped rows are flagged and excluded from the totals).
//   2. Already-scheduled one-off transactions whose charge date (processedDate,
//      e.g. credit-card installments / תשלומים) falls inside the next cycle and
//      that aren't already linked to a recurring rule (so no double counting).
export async function getNextCycleForecast(_args: object, ctx: AdvisorContext) {
  const [hh] = await db
    .select({
      id: households.id,
      billingCycleStartDay: households.billingCycleStartDay,
      autoDetectCycleStart: households.autoDetectCycleStart,
      immediateChargeCards: households.immediateChargeCards,
    })
    .from(households)
    .where(eq(households.id, ctx.householdId))
    .limit(1);

  // Next cycle starts the day after the resolved (salary-anchored) current
  // cycle ends — not on a naive calendar-month step.
  const currentCycle = await resolveActiveBillingCycle(hh);
  const nextCycle = projectNextCycle(currentCycle, hh.billingCycleStartDay);
  const startStr = format(nextCycle.startDate, 'yyyy-MM-dd');
  const endStr = format(nextCycle.endDate, 'yyyy-MM-dd');

  // Source 1: skip-aware recurring projection.
  const preview = await projectCycleRecurring(ctx.householdId, nextCycle);

  // Source 2: scheduled one-off charges (installments) landing in the window.
  //
  // Cycle membership uses the EFFECTIVE date (same rule as every chart): a
  // regular credit card buckets by its future bill date (processedDate), but an
  // immediate-charge / debit-style card buckets by purchase date — its money
  // already left the account, so it can NOT be a future outflow. Without this,
  // a debit card whose processedDate happens to be a future bill date would
  // wrongly surface as an upcoming payment.
  //
  // recurringRuleId IS NULL keeps us from double-counting rows the projection
  // already covers.
  const effectiveDate = effectiveCycleDateSql(hh.immediateChargeCards ?? []);
  const conds: SQL[] = [
    eq(transactions.householdId, ctx.householdId),
    eq(transactions.isInternalTransfer, false),
    eq(transactions.isAggregatedCharge, false),
    isNull(transactions.recurringRuleId),
    sql`${effectiveDate} >= ${startStr}`,
    sql`${effectiveDate} <= ${endStr}`,
  ];

  const scheduledRows = await db
    .select({
      date: sql<string>`${effectiveDate}`,
      amount: transactions.amount,
      description: transactions.description,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      categoryKey: categories.key,
      accountName: accounts.displayName,
      accountType: accounts.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds))
    .orderBy(desc(sql`${effectiveDate}`));

  const scheduledExpenses = scheduledRows
    .filter((r) => Number(r.amount) < 0)
    .map((r) => ({
      date: r.date,
      description: r.description,
      amount: Math.abs(Number(r.amount)),
      installment:
        r.installmentNumber && r.installmentTotal
          ? `${r.installmentNumber}/${r.installmentTotal}`
          : null,
      category: r.categoryKey ?? 'uncategorized',
      account: r.accountName,
    }));

  const scheduledExpenseTotal = scheduledExpenses.reduce(
    (s, r) => s + r.amount,
    0,
  );

  return {
    cycle: { startDate: startStr, endDate: endStr },
    // Recurring rules projected into next cycle. `skipped: true` rows are NOT
    // counted in recurringExpenseTotal / recurringIncomeTotal.
    recurringItems: preview.items.map((i) => ({
      name: i.name,
      type: i.type,
      amount: i.amount,
      skipped: i.skipped,
    })),
    recurringExpenseTotal: preview.totalExpense,
    recurringIncomeTotal: preview.totalIncome,
    // Already-scheduled installments / one-off charges in the window.
    scheduledExpenses,
    scheduledExpenseTotal,
    // Bottom line the user actually cares about: recurring (minus skips) plus
    // scheduled installments.
    totalExpectedExpense: preview.totalExpense + scheduledExpenseTotal,
  };
}
