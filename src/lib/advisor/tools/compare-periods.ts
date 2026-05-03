import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';
import type { AdvisorContext } from '../wrap-tool';

type Args = {
  periodAStart: string;
  periodAEnd: string;
  periodBStart: string;
  periodBEnd: string;
};

// Bank-only filter across both totals and category diffs. This matches the
// dashboard's "what cashed out" math (no double-count between CC purchases
// and bank-side CC bills). Category granularity at the bank level is poor
// — for that, the advisor should call getSpendingByCategory separately
// (which is CC-only).
async function periodSummary(
  householdId: string,
  start: string,
  end: string,
) {
  const totals = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.amount} > 0 then ${transactions.amount} else 0 end), 0)::text`,
      expense: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)::text`,
      txCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(accounts.type, 'bank'),
        gte(transactions.date, start),
        lte(transactions.date, end),
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
      ),
    );

  const byCategory = await db
    .select({
      categoryKey: categories.key,
      total: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)::text`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(accounts.type, 'bank'),
        gte(transactions.date, start),
        lte(transactions.date, end),
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
      ),
    )
    .groupBy(categories.key);

  return {
    income: parseFloat(totals[0]?.income ?? '0'),
    expense: parseFloat(totals[0]?.expense ?? '0'),
    transactionCount: totals[0]?.txCount ?? 0,
    byCategory: byCategory
      .map((r) => ({
        key: r.categoryKey ?? 'uncategorized',
        total: parseFloat(r.total),
      }))
      .sort((a, b) => b.total - a.total),
  };
}

// Side-by-side compare two arbitrary date ranges. Useful for
// month-over-month, year-over-year, or "before/after" experiments.
// Returns top 10 category-level diffs ordered by absolute change.
export async function compareSpendingPeriods(
  args: Args,
  ctx: AdvisorContext,
) {
  const [a, b] = await Promise.all([
    periodSummary(ctx.householdId, args.periodAStart, args.periodAEnd),
    periodSummary(ctx.householdId, args.periodBStart, args.periodBEnd),
  ]);

  const allKeys = new Set<string>();
  a.byCategory.forEach((c) => allKeys.add(c.key));
  b.byCategory.forEach((c) => allKeys.add(c.key));

  const aMap = new Map(a.byCategory.map((c) => [c.key, c.total]));
  const bMap = new Map(b.byCategory.map((c) => [c.key, c.total]));

  const diffs = Array.from(allKeys).map((key) => {
    const aVal = aMap.get(key) ?? 0;
    const bVal = bMap.get(key) ?? 0;
    return {
      key,
      periodA: aVal,
      periodB: bVal,
      delta: bVal - aVal,
      pctChange: aVal > 0 ? ((bVal - aVal) / aVal) * 100 : null,
    };
  });
  diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    periodA: { start: args.periodAStart, end: args.periodAEnd, ...a },
    periodB: { start: args.periodBStart, end: args.periodBEnd, ...b },
    expenseDelta: b.expense - a.expense,
    incomeDelta: b.income - a.income,
    categoryDiffs: diffs.slice(0, 10),
  };
}
