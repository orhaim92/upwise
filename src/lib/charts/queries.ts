import { and, desc, eq, sql } from 'drizzle-orm';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { db } from '@/lib/db';
import {
  accounts,
  categories,
  recurringRules,
  transactions,
} from '@/lib/db/schema';
import type { BillingCycle } from '@/lib/cycles/billing-cycle';
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
  month: string; // 'yyyy-MM'
  monthLabel: string; // localized
  income: number;
  expense: number;
  net: number;
};

export async function getMonthlyTrend(
  householdId: string,
  monthsBack: number,
): Promise<TrendPoint[]> {
  const today = new Date();
  const earliest = startOfMonth(subMonths(today, monthsBack - 1));
  const earliestStr = format(earliest, 'yyyy-MM-dd');

  // Income: any positive bank-account amount counts (salary, refunds, etc.)
  //         — credit cards don't generate real income.
  // Expense: same whitelist as the donut/forecast/diff (CC line items + bank
  //         rows in the bank-paid category list).
  const rows = await db
    .select({
      month: sql<string>`to_char(COALESCE(${transactions.processedDate}, ${transactions.date})::date, 'YYYY-MM')`,
      income: sql<string>`coalesce(sum(case when ${transactions.amount} > 0 AND ${accounts.type} = 'bank' then ${transactions.amount} else 0 end), 0)::text`,
      expense: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 AND (${accounts.type} = 'credit_card' OR (${accounts.type} = 'bank' AND ${categories.key} IN ${BANK_ONLY_EXPENSE_CATEGORIES})) then -${transactions.amount} else 0 end), 0)::text`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${earliestStr}`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
      ),
    )
    .groupBy(
      sql`to_char(COALESCE(${transactions.processedDate}, ${transactions.date})::date, 'YYYY-MM')`,
    )
    .orderBy(
      sql`to_char(COALESCE(${transactions.processedDate}, ${transactions.date})::date, 'YYYY-MM')`,
    );

  const map = new Map(rows.map((r) => [r.month, r]));
  const out: TrendPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = subMonths(today, i);
    const key = format(date, 'yyyy-MM');
    const r = map.get(key);
    const income = r ? parseFloat(r.income) : 0;
    const expense = r ? parseFloat(r.expense) : 0;
    out.push({
      month: key,
      monthLabel: date.toLocaleDateString('he-IL', {
        month: 'short',
        year: '2-digit',
      }),
      income,
      expense,
      net: income - expense,
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

export async function getMonthOverMonthDiff(
  householdId: string,
  today: Date = new Date(),
): Promise<CategoryDiff[]> {
  const currentStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const currentEnd = format(today, 'yyyy-MM-dd');
  const prevStart = format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd');
  const prevEnd = format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd');

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

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return diffs.slice(0, 8);
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
