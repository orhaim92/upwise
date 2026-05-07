import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';
import type { AdvisorContext } from '../wrap-tool';

type Args = {
  startDate: string;
  endDate: string;
};

// Same whitelist as the dashboard charts (src/lib/charts/queries.ts):
//   - Every CC line item counts (each carries merchant + category)
//   - Bank rows count only when categorized as something we KNOW is paid
//     directly from the bank (mortgage / cash withdrawal / fees) — anything
//     else from the bank is dropped, because it's almost always either a CC
//     bill aggregate (would double-count) or an unflagged "דיירקט" row.
//   - Cycle membership uses COALESCE(processedDate, date) so CC purchases
//     land in the cycle the bank actually billed them in.
//
// This was the source of the discrepancy between the chart total and what
// the advisor reported: the advisor used to be CC-only (no bank-paid
// categories), so it underreported things like mortgage and cash withdrawal.
const BANK_ONLY_EXPENSE_CATEGORIES = [
  'mortgage',
  'cash_withdrawal',
  'fees',
] as const;

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
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${args.startDate}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${args.endDate}`,
        sql`${transactions.amount} < 0`,
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        sql`(
          ${accounts.type} = 'credit_card'
          OR (
            ${accounts.type} = 'bank'
            AND ${categories.key} IN ${BANK_ONLY_EXPENSE_CATEGORIES}
          )
        )`,
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
