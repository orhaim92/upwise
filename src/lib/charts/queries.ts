import { and, desc, eq, sql } from 'drizzle-orm';
import { format, subMonths } from 'date-fns';
import { db } from '@/lib/db';
import {
  accounts,
  categories,
  recurringRules,
  transactions,
} from '@/lib/db/schema';
import {
  getActiveBillingCycle,
  type BillingCycle,
} from '@/lib/cycles/billing-cycle';
import {
  enumerateOccurrences,
  hasOccurrenceInWindow,
} from '@/lib/cycles/frequency';

// Whitelist of expense categories that we trust come straight from the bank
// (not paid via credit card). Anything outside this list, when found on a
// bank account, is dropped from the chart totals — most of those are either
// real CC representations the auto-detect couldn't flag (e.g. unpaired
// "דיירקט" rows) or bank-side aggregates of CC bills, both of which would
// double-count against the per-line-item CC view.
//
// CC line items are always counted (no whitelist applies on the CC side).
// Income is treated separately (any positive bank amount counts) since CC
// accounts don't generate real income.
const BANK_ONLY_EXPENSE_CATEGORIES = [
  'mortgage',
  'cash_withdrawal',
  'fees',
] as const;

// SQL fragment used by every expense aggregation. Keeps the rule in one
// place so changing the whitelist updates donut/forecast/diff/trend together.
const expenseRowFilter = sql`(
  ${accounts.type} = 'credit_card'
  OR (
    ${accounts.type} = 'bank'
    AND ${categories.key} IN ${BANK_ONLY_EXPENSE_CATEGORIES}
  )
)`;

export type DonutSlice = {
  key: string;
  label: string;
  icon: string | null;
  value: number;
};

export async function getCurrentCycleSpendByCategory(
  householdId: string,
  cycle: BillingCycle,
): Promise<DonutSlice[]> {
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const endStr = format(cycle.endDate, 'yyyy-MM-dd');

  // Whitelisted view: every CC line item, plus bank rows only when their
  // category is something we know is bank-paid (mortgage, cash withdrawal,
  // fees). Anything else from the bank side is dropped — that catches both
  // unflagged CC representations like "דיירקט" rows and any uncategorized
  // bank items that would otherwise double up against CC line items.
  const rows = await db
    .select({
      key: categories.key,
      icon: categories.icon,
      total: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)::text`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${endStr}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        expenseRowFilter,
      ),
    )
    .groupBy(categories.key, categories.icon)
    .orderBy(
      desc(
        sql`sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end)`,
      ),
    );

  return rows
    .filter((r) => parseFloat(r.total) > 0)
    .map((r) => ({
      key: r.key ?? 'uncategorized',
      label: r.key ?? 'uncategorized', // i18n applied client-side
      icon: r.icon,
      value: parseFloat(r.total),
    }));
}

export type CategoryTxStub = {
  description: string;
  amount: number; // already absolute-valued (positive)
  date: string; // 'yyyy-MM-dd'
};

// Per-category transaction list for the hover tooltip on the donut + diff
// charts. Returns a record keyed by categoryKey (with 'uncategorized' as the
// catch-all for null categoryId — the renderer collapses this into 'other').
// Same whitelist filter as the donut so totals add up to what the slice shows.
// Sorted newest-first within each category.
export async function getTransactionsByCategoryForCycle(
  householdId: string,
  cycle: BillingCycle,
): Promise<Record<string, CategoryTxStub[]>> {
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const endStr = format(cycle.endDate, 'yyyy-MM-dd');

  const rows = await db
    .select({
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
      categoryKey: categories.key,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${endStr}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        expenseRowFilter,
      ),
    )
    .orderBy(desc(transactions.date));

  const out: Record<string, CategoryTxStub[]> = {};
  for (const r of rows) {
    const key = r.categoryKey ?? 'uncategorized';
    if (!out[key]) out[key] = [];
    out[key].push({
      description: r.description,
      amount: Math.abs(parseFloat(r.amount)),
      date: r.date,
    });
  }
  return out;
}

export type CycleSpendComparison = {
  // Sum of all expense recurring rules' expected amounts in this cycle.
  // For non-monthly frequencies (e.g. bi_monthly), an occurrence count is
  // computed via enumerateOccurrences over the cycle window — so a quarterly
  // 600 ₪ rule that doesn't fall in this cycle contributes 0; one that does
  // contributes 600.
  expectedRecurring: number;
  // Realized expenses in the cycle so far, using the same whitelist filter
  // as the donut (CC line items + bank rows in the bank-paid category list).
  actual: number;
  // Subset of `actual` that's already linked to a recurring rule — i.e.,
  // recurring obligations the user has already paid this cycle. Helps see
  // "I've spent X on recurring obligations vs Y in variable spend."
  actualRecurring: number;
  // actual - actualRecurring. The variable / discretionary slice.
  actualVariable: number;
  daysIntoCycle: number;
  daysInCycle: number;
};

// Compute the "expected recurring vs actual" comparison for a cycle. Replaces
// the cumulative-line forecast which was uninformative for past cycles and
// noisy for the current cycle.
export async function getCycleSpendComparison(
  householdId: string,
  cycle: BillingCycle,
  today: Date = new Date(),
): Promise<CycleSpendComparison> {
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const endStr = format(cycle.endDate, 'yyyy-MM-dd');

  // 1. Expected recurring: walk every active confirmed expense rule and ask
  // how many times it occurs inside the cycle window. Sum amount × occurrences.
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, householdId),
        eq(recurringRules.type, 'expense'),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  let expectedRecurring = 0;
  for (const r of rules) {
    const occs = enumerateOccurrences(
      {
        frequency: r.frequency,
        customIntervalDays: r.customIntervalDays,
        startDate: r.startDate,
        endDate: r.endDate,
      },
      cycle.startDate,
      cycle.endDate,
    );
    expectedRecurring += occs.length * Number(r.expectedAmount);
  }

  // 2. Actual: same whitelist as donut, scoped to this cycle window.
  const txs = await db
    .select({
      amount: transactions.amount,
      recurringRuleId: transactions.recurringRuleId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${endStr}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        expenseRowFilter,
      ),
    );

  let actual = 0;
  let actualRecurring = 0;
  for (const t of txs) {
    const v = -parseFloat(t.amount);
    actual += v;
    if (t.recurringRuleId) actualRecurring += v;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysInCycle =
    Math.round(
      (cycle.endDate.getTime() - cycle.startDate.getTime()) / msPerDay,
    ) + 1;
  const todayClamped =
    today < cycle.startDate
      ? cycle.startDate
      : today > cycle.endDate
        ? cycle.endDate
        : today;
  const daysIntoCycle =
    Math.round(
      (todayClamped.getTime() - cycle.startDate.getTime()) / msPerDay,
    ) + 1;

  return {
    expectedRecurring,
    actual,
    actualRecurring,
    actualVariable: Math.max(0, actual - actualRecurring),
    daysIntoCycle: Math.max(1, daysIntoCycle),
    daysInCycle,
  };
}

export type ForecastPoint = {
  day: string; // 'yyyy-MM-dd'
  actual: number | null; // cumulative expenses up to this day, null if future
  projected: number | null; // null until today, then projection
};

// Build the cycle forecast: a daily series of cumulative expenses through the
// cycle. Past = actuals. Today onward = actuals + projected recurring + a
// smoothed continuation of variable-spend rate (avg of daily totals at or
// below the 80th percentile, so outlier days don't dominate).
export async function getCycleForecast(
  householdId: string,
  cycle: BillingCycle,
  today: Date = new Date(),
): Promise<ForecastPoint[]> {
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  // Same whitelist filter as the donut (CC line items + bank rows in the
  // bank-paid category list). Keeps the forecast's actuals line consistent
  // with the donut total at any point on the timeline.
  const txs = await db
    .select({
      effectiveDate: sql<string>`COALESCE(${transactions.processedDate}, ${transactions.date})`,
      amount: transactions.amount,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${todayStr}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        expenseRowFilter,
      ),
    );

  const byDay = new Map<string, number>();
  for (const tx of txs) {
    const v = -parseFloat(tx.amount);
    byDay.set(tx.effectiveDate, (byDay.get(tx.effectiveDate) ?? 0) + v);
  }

  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, householdId),
        eq(recurringRules.type, 'expense'),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const remainingRecurringByDay = new Map<string, number>();
  for (const r of rules) {
    if (
      !hasOccurrenceInWindow(
        {
          frequency: r.frequency,
          customIntervalDays: r.customIntervalDays,
          startDate: r.startDate,
          endDate: r.endDate,
          remainingOccurrences: r.remainingOccurrences,
        },
        tomorrow,
        cycle.endDate,
      )
    ) {
      continue;
    }

    // Skip if a tx is already linked to this rule in the current cycle —
    // proxies "already materialized." Prevents double-counting recurring
    // charges that already showed up in `byDay`.
    const linked = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.recurringRuleId, r.id),
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${todayStr}`,
        ),
      );
    if ((linked[0]?.count ?? 0) > 0) continue;

    const occs = enumerateOccurrences(
      {
        frequency: r.frequency,
        customIntervalDays: r.customIntervalDays,
        startDate: r.startDate,
        endDate: r.endDate,
      },
      tomorrow,
      cycle.endDate,
    );
    for (const occ of occs) {
      const k = format(occ, 'yyyy-MM-dd');
      remainingRecurringByDay.set(
        k,
        (remainingRecurringByDay.get(k) ?? 0) + Number(r.expectedAmount),
      );
    }
  }

  // Variable-spend rate: avg of daily totals at or below the 80th percentile.
  // Filtering above p80 stops a single big day (rent, large purchase) from
  // dragging the daily projection up unrealistically.
  const sortedDailyValues = Array.from(byDay.values()).sort((a, b) => a - b);
  const p80Idx = Math.floor(sortedDailyValues.length * 0.8);
  const variableValues = sortedDailyValues.slice(0, p80Idx + 1);
  const variableRate =
    variableValues.length > 0
      ? variableValues.reduce((s, v) => s + v, 0) / variableValues.length
      : 0;

  const series: ForecastPoint[] = [];
  let cumulativeActual = 0;
  let cumulativeProjected = 0;

  const cursor = new Date(cycle.startDate);
  cursor.setHours(0, 0, 0, 0);
  const endCursor = new Date(cycle.endDate);
  endCursor.setHours(0, 0, 0, 0);
  const todayCursor = new Date(today);
  todayCursor.setHours(0, 0, 0, 0);

  while (cursor <= endCursor) {
    const k = format(cursor, 'yyyy-MM-dd');

    if (cursor <= todayCursor) {
      cumulativeActual += byDay.get(k) ?? 0;
      cumulativeProjected = cumulativeActual;
      series.push({
        day: k,
        actual: cumulativeActual,
        projected: cumulativeActual,
      });
    } else {
      cumulativeProjected += variableRate + (remainingRecurringByDay.get(k) ?? 0);
      series.push({ day: k, actual: null, projected: cumulativeProjected });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

export type TrendPoint = {
  // Cycle start date (yyyy-MM-dd). Field name kept as `month` for backward
  // compat with the chart component — the unit just changed semantics.
  month: string;
  monthLabel: string; // localized; e.g. "אפר 26" — the month the cycle starts in
  income: number;
  expense: number;
  net: number;
};

// Buckets transactions by their billing cycle (not calendar month) so all
// charts are consistent with the dashboard's allowance math. Pulls flat rows
// inside the window and buckets them in JS — simpler than computing cycle
// boundaries in SQL via interval arithmetic.
//
// Smart-shift for income: salary occasionally lands 1–3 days before its usual
// pay date (holiday weekends), which can drop it into the previous cycle and
// make the trend chart misattribute "this cycle's income" to the prior one.
// For income transactions linked to a recurring rule, we look at the other
// linked occurrences' median day-of-month and bucket THIS one into the cycle
// that contains that day in the same calendar month — i.e., the cycle the
// salary normally lands in.
export async function getMonthlyTrend(
  householdId: string,
  cyclesBack: number,
  cycleStartDay: number,
): Promise<TrendPoint[]> {
  const today = new Date();
  // Earliest cycle start = the cycle containing (today - (cyclesBack-1) months)
  const earliestTargetDate = subMonths(today, cyclesBack - 1);
  const earliestCycle = getActiveBillingCycle(cycleStartDay, earliestTargetDate);
  const earliestStr = format(earliestCycle.startDate, 'yyyy-MM-dd');

  // Pull a wider history window so smart-shift has enough past linked
  // occurrences (per rule) to compute a stable median day-of-month even when
  // the user is asking for a short range like 3 months. 15 months is enough
  // to see ~10–14 monthly occurrences per rule.
  const historyWindow = format(subMonths(today, 15), 'yyyy-MM-dd');

  const rows = await db
    .select({
      effectiveDate: sql<string>`COALESCE(${transactions.processedDate}, ${transactions.date})`,
      amount: transactions.amount,
      accountType: accounts.type,
      categoryKey: categories.key,
      recurringRuleId: transactions.recurringRuleId,
      recurringRuleType: recurringRules.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(
      recurringRules,
      eq(recurringRules.id, transactions.recurringRuleId),
    )
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${historyWindow}`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
      ),
    );

  // Compute median day-of-month per income recurring rule. Only income for
  // now — that's the user's reported pain point. Easy to extend to expense.
  const incomeRuleDays = new Map<string, number[]>();
  for (const r of rows) {
    if (
      r.recurringRuleId &&
      r.recurringRuleType === 'income' &&
      parseFloat(r.amount) > 0
    ) {
      const day = new Date(r.effectiveDate).getDate();
      const arr = incomeRuleDays.get(r.recurringRuleId) ?? [];
      arr.push(day);
      incomeRuleDays.set(r.recurringRuleId, arr);
    }
  }
  const incomeRuleMedianDay = new Map<string, number>();
  for (const [ruleId, days] of incomeRuleDays) {
    if (days.length < 2) continue; // need at least 2 occurrences to trust
    const sorted = [...days].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    incomeRuleMedianDay.set(ruleId, median);
  }

  const bankOnly = new Set<string>(BANK_ONLY_EXPENSE_CATEGORIES);
  // key = cycle start yyyy-MM-dd
  const buckets = new Map<string, { income: number; expense: number }>();

  for (const r of rows) {
    const txDate = new Date(r.effectiveDate);
    if (txDate < earliestCycle.startDate) continue; // history-only row, used for median calc

    let cycle = getActiveBillingCycle(cycleStartDay, txDate);

    // Smart-shift for linked income: snap to the cycle that contains the
    // rule's median pay-day in the same calendar month.
    if (
      r.recurringRuleId &&
      r.recurringRuleType === 'income' &&
      parseFloat(r.amount) > 0
    ) {
      const medianDay = incomeRuleMedianDay.get(r.recurringRuleId);
      if (medianDay !== undefined && Math.abs(txDate.getDate() - medianDay) <= 7) {
        // Anchor on the same calendar month/year as the actual transaction,
        // but use the rule's typical day for cycle assignment.
        const anchored = new Date(
          txDate.getFullYear(),
          txDate.getMonth(),
          medianDay,
        );
        cycle = getActiveBillingCycle(cycleStartDay, anchored);
      }
    }

    const key = format(cycle.startDate, 'yyyy-MM-dd');
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { income: 0, expense: 0 };
      buckets.set(key, bucket);
    }
    const amt = parseFloat(r.amount);
    if (amt > 0 && r.accountType === 'bank') {
      bucket.income += amt;
    } else if (amt < 0) {
      const isCC = r.accountType === 'credit_card';
      const isBankPaid =
        r.accountType === 'bank' &&
        r.categoryKey !== null &&
        bankOnly.has(r.categoryKey);
      if (isCC || isBankPaid) {
        bucket.expense += -amt;
      }
    }
  }

  // Build a complete series for each of the N cycles (oldest → newest),
  // even if some have no transactions (so the bar chart stays evenly spaced).
  const out: TrendPoint[] = [];
  for (let i = cyclesBack - 1; i >= 0; i--) {
    const targetDate = subMonths(today, i);
    const cycle = getActiveBillingCycle(cycleStartDay, targetDate);
    const key = format(cycle.startDate, 'yyyy-MM-dd');
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    out.push({
      month: key,
      monthLabel: cycle.startDate.toLocaleDateString('he-IL', {
        month: 'short',
        year: '2-digit',
      }),
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.income - bucket.expense,
    });
  }
  return out;
}

export type CategoryDiff = {
  key: string;
  icon: string | null;
  previous: number;
  current: number;
  delta: number;
  pctChange: number | null;
};

// Now compares current billing cycle vs previous billing cycle (used to be
// calendar months). Function name kept for backward compat but the unit is
// "cycle" everywhere downstream.
export async function getMonthOverMonthDiff(
  householdId: string,
  cycleStartDay: number,
  today: Date = new Date(),
): Promise<CategoryDiff[]> {
  const currentCycle = getActiveBillingCycle(cycleStartDay, today);
  const prevCycle = getActiveBillingCycle(
    cycleStartDay,
    subMonths(today, 1),
  );

  const currentStart = format(currentCycle.startDate, 'yyyy-MM-dd');
  // Cap "current" at today — past-today expenses haven't happened yet.
  const currentEnd = format(
    today < currentCycle.endDate ? today : currentCycle.endDate,
    'yyyy-MM-dd',
  );
  const prevStart = format(prevCycle.startDate, 'yyyy-MM-dd');
  const prevEnd = format(prevCycle.endDate, 'yyyy-MM-dd');

  // Same whitelist filter as the donut/forecast/trend.
  async function categorySpend(start: string, end: string) {
    return db
      .select({
        key: categories.key,
        icon: categories.icon,
        total: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)::text`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.householdId, householdId),
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${start}`,
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${end}`,
          sql`${transactions.amount} < 0`,
          eq(transactions.isInternalTransfer, false),
          eq(transactions.isAggregatedCharge, false),
          expenseRowFilter,
        ),
      )
      .groupBy(categories.key, categories.icon);
  }

  const [prev, curr] = await Promise.all([
    categorySpend(prevStart, prevEnd),
    categorySpend(currentStart, currentEnd),
  ]);

  const prevMap = new Map(prev.map((r) => [r.key ?? 'uncategorized', r]));
  const currMap = new Map(curr.map((r) => [r.key ?? 'uncategorized', r]));
  const allKeys = new Set([...prevMap.keys(), ...currMap.keys()]);

  const diffs: CategoryDiff[] = Array.from(allKeys).map((key) => {
    const p = parseFloat(prevMap.get(key)?.total ?? '0');
    const c = parseFloat(currMap.get(key)?.total ?? '0');
    const icon = currMap.get(key)?.icon ?? prevMap.get(key)?.icon ?? null;
    return {
      key,
      icon,
      previous: p,
      current: c,
      delta: c - p,
      pctChange: p > 0 ? ((c - p) / p) * 100 : null,
    };
  });

  // Show every category with non-zero spend in either cycle (was top-8).
  // The diff chart card scrolls vertically, so a long list is fine.
  return diffs
    .filter((d) => d.previous > 0 || d.current > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function rangeToMonths(range: '3m' | '6m' | '12m'): number {
  switch (range) {
    case '3m':
      return 3;
    case '6m':
      return 6;
    case '12m':
      return 12;
  }
}
