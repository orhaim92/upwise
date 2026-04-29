import { listAccounts } from './actions';
import { AccountCard } from './_components/account-card';
import { AddAccountDialog } from './_components/add-account-dialog';
import { t } from '@/lib/i18n/he';

export default async function AccountsPage() {
  const accounts = await listAccounts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.accounts.title}</h1>
          <p className="text-slate-600 mt-1">{t.accounts.subtitle}</p>
        </div>
        <AddAccountDialog />
      </div>

      {accounts.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
          <p className="text-slate-500">{t.accounts.empty}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
