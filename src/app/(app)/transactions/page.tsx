import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { SyncButton } from '@/components/sync-button';
import { TransactionsFilters } from './_components/transactions-filters';
import { TransactionsSort } from './_components/transactions-sort';
import { TransactionsTable } from './_components/transactions-table';
import { listTransactionsGrouped, type TransactionFilters } from './queries';
import { listCategoriesForHousehold } from './actions';
import { t } from '@/lib/i18n/he';

// First-page size. The "Load more" button on the table fetches subsequent
// PAGE_SIZE chunks via a server action; filters keep applying server-side
// to the FULL dataset, not just the loaded slice.
const PAGE_SIZE = 100;

type Props = {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    accountIds?: string;
    categoryKeys?: string;
    type?: string;
    search?: string;
    sort?: string;
    showSpecial?: string;
  }>;
};

const VALID_SORTS = ['date', 'amount_asc', 'amount_desc', 'category'] as const;

export default async function TransactionsPage({ searchParams }: Props) {
  const session = await auth();
  const householdId = await getUserHouseholdId(session!.user.id);
  const params = await searchParams;

  const showSpecial = params.showSpecial === '1';
  const accountIds = params.accountIds
    ? params.accountIds.split(',').filter(Boolean)
    : undefined;
  const categoryKeys = params.categoryKeys
    ? params.categoryKeys.split(',').filter(Boolean)
    : undefined;
  const sort = (
    VALID_SORTS as readonly string[]
  ).includes(params.sort ?? '')
    ? (params.sort as TransactionFilters['sort'])
    : undefined;
  const filters: TransactionFilters = {
    startDate: params.startDate,
    endDate: params.endDate,
    accountIds,
    categoryKeys,
    type: params.type as 'income' | 'expense' | 'all' | undefined,
    search: params.search,
    includeTransfers: showSpecial,
    includeAggregates: showSpecial,
    sort,
  };

  const [txs, accountList, categories] = await Promise.all([
    listTransactionsGrouped(householdId, filters, PAGE_SIZE),
    db
      .select({
        id: accounts.id,
        displayName: accounts.displayName,
      })
      .from(accounts)
      .where(eq(accounts.householdId, householdId)),
    listCategoriesForHousehold(),
  ]);

  // Force the client table to remount with fresh state when filters change
  // — otherwise we'd append new-filter rows onto a stale old-filter list.
  const filterKey = JSON.stringify(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t.transactions.title}</h1>
        <SyncButton />
      </div>

      <TransactionsFilters accounts={accountList} categories={categories} />

      {txs.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
          <p className="text-slate-500">{t.transactions.empty}</p>
        </div>
      ) : (
        <>
          <TransactionsSort />
          <TransactionsTable
            key={filterKey}
            initialTransactions={txs}
            filters={filters}
            pageSize={PAGE_SIZE}
            categories={categories}
          />
        </>
      )}
    </div>
  );
}
