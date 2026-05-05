'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate, formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import { bulkSetTransactionCategory } from '../actions';

export type SimilarTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
  accountDisplayName: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryKey: string;
  categoryIcon: string | null;
  categoryLabel: string;
  matches: SimilarTransaction[];
  // Lets the parent table patch its local rows so the new category shows up
  // immediately on every affected row (no server-side revalidation involved).
  onBulkApplied?: (
    ids: string[],
    categoryKey: string,
    categoryIcon: string | null,
  ) => void;
};

export function ApplyToSimilarDialog({
  open,
  onOpenChange,
  categoryId,
  categoryKey,
  categoryIcon,
  categoryLabel,
  matches,
  onBulkApplied,
}: Props) {
  // Default: every match selected. Reset whenever a fresh batch comes in.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(matches.map((m) => m.id)),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(matches.map((m) => m.id)));
  }, [open, matches]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(matches.map((m) => m.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleConfirm() {
    if (selected.size === 0) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    const ids = Array.from(selected);
    const r = await bulkSetTransactionCategory({
      transactionIds: ids,
      categoryId,
    });
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error ?? t.common.error);
      return;
    }
    toast.success(
      template(t.transactions.applyToSimilarUpdated, {
        n: r.updated ?? selected.size,
      }),
    );
    // Patch the parent table's row state directly. Doing the visual update
    // client-side avoids triggering server-driven revalidation, which raced
    // with base-ui's dialog close and crashed hydration on the next pick.
    onBulkApplied?.(ids, categoryKey, categoryIcon);
    onOpenChange(false);
  }

  const allSelected = selected.size === matches.length && matches.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{categoryIcon ?? '📦'}</span>
            <span>{t.transactions.applyToSimilarTitle}</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-600">
          {template(t.transactions.applyToSimilarBody, { n: matches.length })}
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            <span className="font-medium text-violet-700">{categoryLabel}</span>
          </span>
          <button
            type="button"
            onClick={allSelected ? selectNone : selectAll}
            className="text-violet-600 hover:text-violet-700 font-medium"
          >
            {allSelected
              ? t.transactions.applyToSimilarSelectNone
              : t.transactions.applyToSimilarSelectAll}
          </button>
        </div>

        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {matches.map((m) => {
            const checked = selected.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-start"
                >
                  <span
                    className={
                      'size-5 rounded border flex items-center justify-center shrink-0 ' +
                      (checked
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'border-slate-300')
                    }
                  >
                    {checked && <Check className="size-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      <bdi>{m.description}</bdi>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {formatDate(m.date)} · {m.accountDisplayName}
                    </p>
                  </div>
                  <span className="tabular-nums text-sm shrink-0">
                    <bdi>{formatILS(parseFloat(m.amount))}</bdi>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t.transactions.applyToSimilarSkip}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || selected.size === 0}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {template(t.transactions.applyToSimilarConfirm, {
              n: selected.size,
            })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
