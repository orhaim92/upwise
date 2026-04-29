'use client';

import { useState, useTransition } from 'react';
import { Building2, CreditCard, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SyncButton } from '@/components/sync-button';
import { getProvider } from '@/lib/providers';
import { deleteAccount } from '../actions';
import { t } from '@/lib/i18n/he';
import { EditAccountDialog } from './edit-account-dialog';

type Account = {
  id: string;
  type: 'bank' | 'credit_card';
  provider: string;
  displayName: string;
  accountNumberMasked: string | null;
  lastScrapedAt: Date | null;
  scrapeStatus: string;
  scrapeError: string | null;
  isActive: boolean;
};

function localizeScrapeError(error: string | null): string | null {
  if (!error) return null;
  if (error.startsWith('INVALID_PASSWORD')) return t.sync.errorInvalidPassword;
  if (error.startsWith('CHANGE_PASSWORD')) return t.sync.errorChangePassword;
  if (error.startsWith('TIMEOUT')) return t.sync.errorTimeout;
  if (error.startsWith('BLOCKED')) return t.sync.errorBlocked;
  return t.sync.errorGeneric;
}

export function AccountCard({ account }: { account: Account }) {
  const provider = getProvider(account.provider);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = account.type === 'bank' ? Building2 : CreditCard;
  const errorMessage =
    account.scrapeStatus === 'error'
      ? localizeScrapeError(account.scrapeError)
      : null;

  function handleDelete() {
    if (!confirm(t.accounts.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteAccount({ id: account.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(t.accounts.deleteSuccess);
    });
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
              <Icon className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{account.displayName}</h3>
              <p className="text-sm text-slate-600">{provider?.name}</p>
              {account.accountNumberMasked && (
                <p
                  className="text-xs text-slate-500 mt-1 font-mono"
                  dir="ltr"
                >
                  {account.accountNumberMasked}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-1 shrink-0">
            <SyncButton
              accountId={account.id}
              size="icon"
              variant="ghost"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              aria-label={t.accounts.edit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={pending}
              aria-label={t.accounts.delete}
            >
              <Trash2 className="size-4 text-rose-600" />
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
          {account.lastScrapedAt
            ? `${t.accounts.lastSync}: ${new Date(account.lastScrapedAt).toLocaleString('he-IL')}`
            : t.accounts.neverSynced}
        </div>

        {errorMessage && (
          <p className="mt-2 text-xs text-rose-600">{errorMessage}</p>
        )}
      </Card>

      <EditAccountDialog
        account={account}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}
