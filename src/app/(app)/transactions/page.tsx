import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { SyncButton } from '@/components/sync-button';
import { TransactionsFilters } from './_components/transactions-filters';
import { TransactionsTable } from './_components/transactions-table';
import { listTransactionsGrouped } from './queries';
import { listCategoriesForHousehold } from './actions';
import { t } from '@/lib/i18n/he';

type Props = {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    accountId?: string;
    type?: string;
    search?: string;
    showSpecial?: string;
  }>;
};

export default async function TransactionsPage({ searchParams }: Props) {
  const session = await auth();
  const householdId = await getUserHouseholdId(session!.user.id);
  const params = await searchParams;

  const showSpecial = params.showSpecial === '1';
  const filters = {
    startDate: params.startDate,
    endDate: params.endDate,
    accountId: params.accountId,
    type: params.type as 'income' | 'expense' | 'all' | undefined,
    search: params.search,
    includeTransfers: showSpecial,
    includeAggregates: showSpecial,
  };

  const [txs, accountList, categories] = await Promise.all([
    listTransactionsGrouped(householdId, filters, 500),
    db
      .select({
        id: accounts.id,
        displayName: accounts.displayName,
      })
      .from(accounts)
      .where(eq(accounts.householdId, householdId)),
    listCategoriesForHousehold(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t.transactions.title}</h1>
        <SyncButton />
      </div>

      <TransactionsFilters accounts={accountList} />

      {txs.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
          <p className="text-slate-500">{t.transactions.empty}</p>
        </div>
      ) : (
        <TransactionsTable transactions={txs} categories={categories} />
      )}
    </div>
  );
}
