'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { template } from '@/lib/format';
import { t } from '@/lib/i18n/he';

type SyncResultRow = {
  status: string;
  scraped: number;
  inserted: number;
  displayName: string;
  errorMessage?: string;
};

type Props = {
  accountId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  label?: string;
};

export function SyncButton({
  accountId,
  variant = 'default',
  size = 'default',
  label,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountId ? { accountId } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        dispatched?: boolean;
        results?: SyncResultRow[];
      };

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? t.sync.syncError);
        return;
      }

      // New flow: sync runs in GitHub Actions. The endpoint just dispatches
      // the workflow and returns immediately — results land in the DB ~1-2
      // minutes later. The user refreshes the page to see updated data.
      if (data.dispatched) {
        toast.success(t.sync.syncDispatched);
        return;
      }

      // Legacy in-process path (kept defensively in case the env reverts).
      const results = data.results ?? [];
      const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
      const totalScraped = results.reduce((sum, r) => sum + r.scraped, 0);
      const errors = results.filter((r) => r.status === 'error');

      if (errors.length > 0 && totalInserted === 0) {
        toast.error(`${t.sync.syncError}: ${errors[0].errorMessage ?? ''}`);
      } else if (errors.length > 0) {
        toast.warning(t.sync.syncPartialSuccess);
      } else {
        toast.success(
          template(t.sync.syncSuccess, { count: totalInserted }) +
            ` (סרק ${totalScraped})`,
        );
      }
      router.refresh();
    } catch {
      toast.error(t.sync.syncError);
    } finally {
      setLoading(false);
    }
  }

  const labelText = label ?? (accountId ? t.sync.refresh : t.sync.refreshAll);

  return (
    <Button
      onClick={handleSync}
      disabled={loading}
      variant={variant}
      size={size}
      className={
        variant === 'default'
          ? 'bg-violet-600 text-white hover:bg-violet-700'
          : undefined
      }
      aria-label={size === 'icon' ? labelText : undefined}
    >
      <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
      {size !== 'icon' && (loading ? t.sync.refreshing : labelText)}
    </Button>
  );
}
