import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { addDays, format, subDays } from 'date-fns';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { findCardForAggregate } from '@/lib/transactions/aggregate-card-lookup';

export type TransactionRow = {
  id: string;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  accountDisplayName: string;
  accountProvider: string;
  accountType: 'bank' | 'credit_card';
  categoryKey: string | null;
  categoryIcon: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  isInternalTransfer: boolean;
  isAggregatedCharge: boolean;
  recurringRuleId: string | null;
  cardLastFour: string | null;
};

export type TransactionRowGrouped = TransactionRow & {
  children?: TransactionRow[];
  childrenSum?: number;
  cardId?: string | null;
};

export type TransactionSort =
  | 'date'
  | 'amount_asc'
  | 'amount_desc'
  | 'category';

// Sentinel category key for "uncategorized" rows (categoryId IS NULL). Kept in
// sync with the filter UI — if the user picks the "no category" pill, this
// string travels through the URL and back to the SQL filter.
export const UNCATEGORIZED_KEY = 'uncategorized';

export type TransactionFilters = {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryKey?: string;
  categoryKeys?: string[];
  type?: 'all' | 'income' | 'expense';
  search?: string;
  includeTransfers?: boolean;
  includeAggregates?: boolean;
  sort?: TransactionSort;
};

export async function listTransactions(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 200,
  offset = 0,
): Promise<TransactionRow[]> {
  const conds: SQL[] = [eq(transactions.householdId, householdId)];

  if (filters.startDate) conds.push(gte(transactions.date, filters.startDate));
  if (filters.endDate) conds.push(lte(transactions.date, filters.endDate));
  if (filters.accountIds && filters.accountIds.length > 0) {
    const inList = sql.join(
      filters.accountIds.map((id) => sql`${id}`),
      sql`, `,
    );
    conds.push(sql`${transactions.accountId} IN (${inList})`);
  }
  if (filters.type === 'income') {
    conds.push(sql`${transactions.amount} > 0`);
  }
  if (filters.type === 'expense') {
    conds.push(sql`${transactions.amount} < 0`);
  }
  if (filters.search && filters.search.trim()) {
    const raw = filters.search.trim();
    const q = `%${raw}%`;
    // Three search dimensions:
    //   1. Free-text in description / rawDescription (ILIKE substring)
    //   2. CC last4 (4 consecutive digits anywhere in the search OR
    //      a 4-digit term — match against transactions.cardLastFour)
    //   3. Numeric — if the term parses as a number, match abs(amount)
    //      EXACTLY (parseFloat tolerates currency symbols + commas already
    //      stripped below).
    const conditions = [
      ilike(transactions.description, q),
      ilike(transactions.rawDescription, q),
    ];

    const fourDigit = raw.match(/\b(\d{4})\b/)?.[1];
    if (fourDigit) {
      conditions.push(eq(transactions.cardLastFour, fourDigit));
    }

    const numeric = parseFloat(raw.replace(/[^\d.\-]/g, ''));
    if (Number.isFinite(numeric) && numeric !== 0) {
      conditions.push(sql`abs(${transactions.amount}) = ${numeric.toFixed(2)}`);
    }

    const searchCond = or(...conditions);
    if (searchCond) conds.push(searchCond);
  }
  if (!filters.includeTransfers) {
    conds.push(eq(transactions.isInternalTransfer, false));
  }
  if (!filters.includeAggregates) {
    conds.push(eq(transactions.isAggregatedCharge, false));
  }

  // Multi-select categories. UNCATEGORIZED_KEY maps to categoryId IS NULL;
  // any other value matches against categories.key. Combined with OR so the
  // user can select named categories AND "uncategorized" together.
  if (filters.categoryKeys && filters.categoryKeys.length > 0) {
    const namedKeys = filters.categoryKeys.filter(
      (k) => k !== UNCATEGORIZED_KEY,
    );
    const includeUncategorized = filters.categoryKeys.includes(
      UNCATEGORIZED_KEY,
    );
    const subConds: SQL[] = [];
    if (namedKeys.length > 0) {
      const inList = sql.join(
        namedKeys.map((k) => sql`${k}`),
        sql`, `,
      );
      subConds.push(sql`${categories.key} IN (${inList})`);
    }
    if (includeUncategorized) {
      subConds.push(sql`${transactions.categoryId} IS NULL`);
    }
    const combined = or(...subConds);
    if (combined) conds.push(combined);
  }

  // Sort by abs(amount) so expenses (negative) and income (positive) compare
  // by magnitude — "high to low" puts the biggest spend or biggest deposit on
  // top regardless of sign. Date-tiebreaker keeps adjacent equal-amount rows
  // in chronological order.
  const orderClauses = (() => {
    switch (filters.sort) {
      case 'amount_asc':
        return [
          sql`abs(${transactions.amount}) asc`,
          desc(transactions.date),
        ];
      case 'amount_desc':
        return [
          sql`abs(${transactions.amount}) desc`,
          desc(transactions.date),
        ];
      case 'category':
        return [
          sql`${categories.key} asc nulls last`,
          desc(transactions.date),
        ];
      case 'date':
      default:
        return [desc(transactions.date), desc(transactions.createdAt)];
    }
  })();

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      accountId: transactions.accountId,
      accountDisplayName: accounts.displayName,
      accountProvider: accounts.provider,
      categoryKey: categories.key,
      categoryIcon: categories.icon,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      isInternalTransfer: transactions.isInternalTransfer,
      isAggregatedCharge: transactions.isAggregatedCharge,
      recurringRuleId: transactions.recurringRuleId,
      accountType: accounts.type,
      cardLastFour: transactions.cardLastFour,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds))
    .orderBy(...orderClauses)
    .limit(limit)
    .offset(offset);

  return rows;
}

// Group transactions: each aggregated bank charge gets its corresponding
// credit-card transactions as children. The (cardAccountId, cardLastFour) pair
// comes from findCardForAggregate. If no card matches, the aggregate renders
// as a leaf with no expansion.
export async function listTransactionsGrouped(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 500,
  offset = 0,
): Promise<TransactionRowGrouped[]> {
  // Fetch exactly `limit` raw rows. Grouping attaches CC children to their
  // aggregate parent (children come from a separate subquery), so the
  // grouped row count == raw row count. Fetching exactly `limit` makes
  // OFFSET-based pagination consistent: page N covers raw rows
  // [N*limit .. (N+1)*limit), no overlap or gaps.
  const all = await listTransactions(
    householdId,
    { ...filters, includeAggregates: true },
    limit,
    offset,
  );

  // Walk `all` in its original order so the user's chosen sort is preserved.
  // Aggregates get children attached inline; non-aggregates pass through.
  // (The previous partition-then-sort-by-date approach undid any non-date sort.)
  const grouped: TransactionRowGrouped[] = [];
  for (const tx of all) {
    if (!tx.isAggregatedCharge) {
      grouped.push(tx);
      continue;
    }
    const agg = tx;
    const match = await findCardForAggregate(householdId, agg.id);
    if (!match) {
      grouped.push({ ...agg, children: [], childrenSum: 0, cardId: null });
      continue;
    }

    // Phase 4.8.3: match children primarily by `processed_date` (תאריך חיוב)
    // — all CC txs in the same billing cycle share this date, so it cleanly
    // separates current/previous/next cycles. ±5 days handles the rare case
    // where the bank tx and CC processedDate are off by a day or two.
    //
    // Only when processedDate is NULL on a CC tx do we fall back to its
    // `date` within the past 35 days (legacy data missing processedDate).
    // Crucially: a row with a populated processedDate that's OUTSIDE the
    // tight window is REJECTED, even if its `date` falls in the wide window
    // — otherwise we'd pull in adjacent billing cycles.
    const aggDate = new Date(agg.date);
    const tightStart = format(subDays(aggDate, 5), 'yyyy-MM-dd');
    const tightEnd = format(addDays(aggDate, 5), 'yyyy-MM-dd');
    const wideStart = format(subDays(aggDate, 35), 'yyyy-MM-dd');
    const wideEnd = format(aggDate, 'yyyy-MM-dd');

    const children = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        description: transactions.description,
        accountId: transactions.accountId,
        accountDisplayName: accounts.displayName,
        accountProvider: accounts.provider,
        accountType: accounts.type,
        categoryKey: categories.key,
        categoryIcon: categories.icon,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        recurringRuleId: transactions.recurringRuleId,
        isAggregatedCharge: transactions.isAggregatedCharge,
        isInternalTransfer: transactions.isInternalTransfer,
        cardLastFour: transactions.cardLastFour,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.accountId, match.cardAccountId),
          eq(transactions.cardLastFour, match.cardLastFour),
          eq(transactions.isInternalTransfer, false),
          eq(transactions.isAggregatedCharge, false),
          or(
            and(
              isNotNull(transactions.processedDate),
              gte(transactions.processedDate, tightStart),
              lte(transactions.processedDate, tightEnd),
            ),
            and(
              sql`${transactions.processedDate} IS NULL`,
              gte(transactions.date, wideStart),
              lte(transactions.date, wideEnd),
            ),
          ),
        ),
      )
      .orderBy(desc(transactions.date));

    // Net sum: expenses (negative) add to the bill, refunds (positive) reduce
    // it. Math.abs() would wrongly count refunds as additional expenses.
    const childrenSum = children.reduce(
      (s, c) => s - parseFloat(c.amount),
      0,
    );

    grouped.push({
      ...agg,
      children: children as TransactionRow[],
      childrenSum,
      cardId: match.cardAccountId,
    });
  }

  return grouped;
}
