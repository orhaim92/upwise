import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';
import type { AdvisorContext } from '../wrap-tool';

type Args = {
  search?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  category?: string;
  type?: 'all' | 'income' | 'expense';
};

// Hard cap. The model only needs a representative slice to answer "what/when/
// how much at X" questions — returning hundreds of rows just burns context and
// invites the model to hallucinate a summary instead of reading the data.
const MAX_ROWS = 50;

// Raw-transaction search for the advisor. Unlike the aggregate tools
// (spending-by-category, compare-periods), this returns individual rows so the
// model can answer specific questions like "how much did I spend at Rami Levy
// last week?" or "show me transactions over 500₪ this month".
//
// Conventions mirror getSpendingByCategory:
//   - Cycle/date membership uses COALESCE(processedDate, date) so CC purchases
//     land on the date the bank actually billed them.
//   - Internal transfers and CC-bill aggregates are excluded — aggregates would
//     double-count against their line items, transfers aren't real spending.
export async function searchTransactions(args: Args, ctx: AdvisorContext) {
  const conds: SQL[] = [
    eq(transactions.householdId, ctx.householdId),
    eq(transactions.isInternalTransfer, false),
    eq(transactions.isAggregatedCharge, false),
  ];

  if (args.startDate) {
    conds.push(
      sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${args.startDate}`,
    );
  }
  if (args.endDate) {
    conds.push(
      sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${args.endDate}`,
    );
  }
  if (args.type === 'income') conds.push(sql`${transactions.amount} > 0`);
  if (args.type === 'expense') conds.push(sql`${transactions.amount} < 0`);

  if (args.search && args.search.trim()) {
    const q = `%${args.search.trim()}%`;
    const searchCond = or(
      ilike(transactions.description, q),
      ilike(transactions.rawDescription, q),
    );
    if (searchCond) conds.push(searchCond);
  }

  if (args.category && args.category.trim()) {
    conds.push(eq(categories.key, args.category.trim()));
  }

  // Amount filters compare magnitude, so they work uniformly for income
  // (positive) and expenses (negative).
  if (typeof args.minAmount === 'number' && Number.isFinite(args.minAmount)) {
    conds.push(sql`abs(${transactions.amount}) >= ${args.minAmount.toFixed(2)}`);
  }
  if (typeof args.maxAmount === 'number' && Number.isFinite(args.maxAmount)) {
    conds.push(sql`abs(${transactions.amount}) <= ${args.maxAmount.toFixed(2)}`);
  }

  const rows = await db
    .select({
      date: sql<string>`COALESCE(${transactions.processedDate}, ${transactions.date})`,
      amount: transactions.amount,
      description: transactions.description,
      categoryKey: categories.key,
      categoryIcon: categories.icon,
      accountName: accounts.displayName,
      accountType: accounts.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds))
    .orderBy(
      desc(sql`COALESCE(${transactions.processedDate}, ${transactions.date})`),
    )
    .limit(MAX_ROWS + 1);

  // We fetched one extra row purely to detect truncation — strip it before
  // returning so the model never sees the +1.
  const truncated = rows.length > MAX_ROWS;
  const visible = truncated ? rows.slice(0, MAX_ROWS) : rows;

  const totalAmount = visible.reduce((s, r) => s + Number(r.amount), 0);

  return {
    filters: args,
    count: visible.length,
    truncated,
    // Net total of the returned rows (income positive, expense negative).
    // Useful when the model asks "how much did I spend at X" — it can sum or
    // read this directly.
    totalAmount,
    transactions: visible.map((r) => ({
      date: r.date,
      description: r.description,
      amount: Number(r.amount),
      type: Number(r.amount) >= 0 ? ('income' as const) : ('expense' as const),
      category: r.categoryKey ?? 'uncategorized',
      categoryIcon: r.categoryIcon ?? '📦',
      account: r.accountName,
    })),
  };
}
