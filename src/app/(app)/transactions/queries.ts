import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, categories, transactions } from '@/lib/db/schema';

export type TransactionRow = {
  id: string;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  accountDisplayName: string;
  accountProvider: string;
  categoryKey: string | null;
  categoryIcon: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
};

export type TransactionFilters = {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryKey?: string;
  type?: 'all' | 'income' | 'expense';
  search?: string;
};

export async function listTransactions(
  householdId: string,
  filters: TransactionFilters = {},
  limit = 200,
): Promise<TransactionRow[]> {
  const conds: SQL[] = [eq(transactions.householdId, householdId)];

  if (filters.startDate) conds.push(gte(transactions.date, filters.startDate));
  if (filters.endDate) conds.push(lte(transactions.date, filters.endDate));
  if (filters.accountId) {
    conds.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.type === 'income') {
    conds.push(sql`${transactions.amount} > 0`);
  }
  if (filters.type === 'expense') {
    conds.push(sql`${transactions.amount} < 0`);
  }
  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    const searchCond = or(
      ilike(transactions.description, q),
      ilike(transactions.rawDescription, q),
    );
    if (searchCond) conds.push(searchCond);
  }

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
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);

  return rows;
}
