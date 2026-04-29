import { differenceInHours } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { template } from '@/lib/format';
import { t } from '@/lib/i18n/he';

type Props = {
  lastSync: Date | null;
};

export function StalenessBanner({ lastSync }: Props) {
  if (!lastSync) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-100 text-slate-700 text-sm">
        <AlertTriangle className="size-4 shrink-0" />
        <span>{t.sync.neverSynced}</span>
      </div>
    );
  }

  const hours = differenceInHours(new Date(), lastSync);

  if (hours <= 12) return null;

  if (hours < 36) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 text-amber-900 text-sm">
        <AlertTriangle className="size-4 shrink-0" />
        <span>{template(t.sync.lastSyncRecent, { hours })}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 text-rose-900 text-sm">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{template(t.sync.lastSyncStale, { hours })}</span>
    </div>
  );
}
