import Link from 'next/link';
import { Plus } from 'lucide-react';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';
import { householdOldestSync } from '@/lib/scrapers/needs-sync';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { SyncButton } from '@/components/sync-button';
import { StalenessBanner } from '@/components/staleness-banner';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n/he';

export default async function DashboardPage() {
  const session = await auth();
  const householdId = await getUserHouseholdId(session!.user.id);

  const [accountCount, txCount, oldestSync] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accounts)
      .where(eq(accounts.householdId, householdId))
      .then((r) => r[0].count),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.householdId, householdId))
      .then((r) => r[0].count),
    householdOldestSync(householdId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>
          <p className="text-slate-600 mt-1">
            {t.dashboard.welcome}, {session?.user.name}
          </p>
        </div>
        {accountCount > 0 && <SyncButton />}
      </div>

      {accountCount === 0 ? (
        <Card className="p-12 text-center bg-white">
          <p className="text-slate-600 mb-4">{t.dashboard.noAccountsYet}</p>
          <Link
            href="/accounts"
            className={cn(
              buttonVariants(),
              'bg-violet-600 text-white hover:bg-violet-700 inline-flex',
            )}
          >
            <Plus className="size-4" />
            {t.dashboard.addFirstAccount}
          </Link>
        </Card>
      ) : (
        <>
          <StalenessBanner lastSync={oldestSync} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-sm text-slate-600">{t.dashboard.totalAccounts}</p>
              <p className="text-3xl font-bold mt-1">{accountCount}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-600">
                {t.dashboard.syncedTransactions}
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{txCount}</p>
            </Card>
          </div>

          <Card className="p-12 text-center bg-white">
            <p className="text-slate-500">{t.dashboard.placeholder}</p>
          </Card>
        </>
      )}
    </div>
  );
}
