import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';
import type { AdvisorContext } from '../wrap-tool';

type Args = {
  startDate: string;
  endDate: string;
};

// Sum negative-amount (expense) transactions per category for an arbitrary
// date range. Restricted to CREDIT-CARD account transactions:
//   - CC purchases carry the merchant name + category, which is what the
//     advisor needs for "where are my biggest expenses" questions.
//   - Including bank txs would double-count (a CC purchase shows up once
//     as the CC tx and once again as part of the bank-side CC bill, since
//     auto-aggregate-detection is best-effort).
//   - Direct-from-bank expenses (rent, loans, salary debits) are still
//     visible to the advisor via getRecurringSummary.
//
// Top 20 categories by total. Each row also carries pct of total spend
// so the model can phrase comparisons naturally ("you spent 32% on food").
export async function getSpendingByCategory(args: Args, ctx: AdvisorContext) {
  const rows = await db
    .select({
      categoryKey: categories.key,
      categoryIcon: categories.icon,
      total: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, ctx.householdId),
        eq(accounts.type, 'credit_card'),
        gte(transactions.date, args.startDate),
        lte(transactions.date, args.endDate),
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
      ),
    )
    .groupBy(categories.key, categories.icon)
    .orderBy(
      desc(
        sql`sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end)`,
      ),
    )
    .limit(20);

  const totalAll = rows.reduce((s, r) => s + parseFloat(r.total), 0);

  return {
    period: { startDate: args.startDate, endDate: args.endDate },
    totalSpend: totalAll,
    categories: rows.map((r) => ({
      key: r.categoryKey ?? 'uncategorized',
      icon: r.categoryIcon ?? '📦',
      total: parseFloat(r.total),
      transactionCount: r.count,
      pctOfTotal: totalAll > 0 ? (parseFloat(r.total) / totalAll) * 100 : 0,
    })),
  };
}
