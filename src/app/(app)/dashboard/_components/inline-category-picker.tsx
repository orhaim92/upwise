'use client';

import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  findSimilarUncategorizedTransactions,
  setTransactionCategory,
} from '@/app/(app)/transactions/actions';
import {
  ApplyToSimilarDialog,
  type SimilarTransaction,
} from '@/app/(app)/transactions/_components/apply-to-similar-dialog';
import { t } from '@/lib/i18n/he';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  transactionId: string;
  currentCategoryKey: string | null;
  categories: Category[];
  // Local optimistic update so the chart popup reflects the choice without
  // waiting for the next page refresh. The chart's totals won't rebalance
  // immediately, but the row icon + identity update so the change is visible.
  onChanged?: (txId: string, categoryKey: string | null) => void;
};

// A small click-to-open category picker used inside the donut + diff hover
// popups. Renders a tiny pencil affordance per row; on click, expands a grid
// of all available categories. Calls setTransactionCategory and then notifies
// the parent so it can patch local state.
export function InlineCategoryPicker({
  transactionId,
  currentCategoryKey,
  categories,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Apply to similar" dialog state. After a successful pick we look up other
  // uncategorized transactions with the same normalized description and, if
  // any are found, prompt to apply this category to all of them — same UX as
  // the picker on the /transactions page.
  const [similarMatches, setSimilarMatches] = useState<SimilarTransaction[]>(
    [],
  );
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarCategoryId, setSimilarCategoryId] = useState<string | null>(
    null,
  );
  const [similarCategoryKey, setSimilarCategoryKey] = useState('');
  const [similarCategoryIcon, setSimilarCategoryIcon] = useState<string | null>(
    null,
  );
  const [similarCategoryLabel, setSimilarCategoryLabel] = useState('');

  function handlePick(cat: Category | null) {
    setOpen(false);
    startTransition(async () => {
      const r = await setTransactionCategory({
        transactionId,
        categoryId: cat?.id ?? null,
      });
      if (!r.ok) {
        toast.error(r.error ?? t.common.error);
        return;
      }
      toast.success(t.transactions.categoryUpdated);
      onChanged?.(transactionId, cat?.key ?? null);

      // Only offer bulk-apply when assigning a category, not clearing, and
      // not when the category didn't actually change.
      if (!cat || cat.key === currentCategoryKey) return;

      const lookup = await findSimilarUncategorizedTransactions({
        transactionId,
      });
      if (!lookup.ok) {
        toast.error(lookup.error ?? t.common.error);
        return;
      }
      if (!lookup.transactions || lookup.transactions.length === 0) return;

      const labelMapInner =
        (t as unknown as { categoryLabels?: Record<string, string> })
          .categoryLabels ?? {};
      setSimilarMatches(lookup.transactions);
      setSimilarCategoryId(cat.id);
      setSimilarCategoryKey(cat.key);
      setSimilarCategoryIcon(cat.icon);
      setSimilarCategoryLabel(labelMapInner[cat.key] ?? cat.key);
      setSimilarOpen(true);
    });
  }

  const labelMap: Record<string, string> =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          disabled={pending}
          aria-label={t.transactions.chooseCategory}
          title={t.transactions.chooseCategory}
          className="size-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-violet-600 hover:bg-slate-100 transition-colors shrink-0 disabled:opacity-50"
        >
          <Pencil className="size-3" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <p className="text-[11px] text-slate-500 mb-1.5 px-1">
            {t.transactions.chooseCategory}
          </p>
          <div className="grid grid-cols-5 gap-1">
            {categories.map((c) => {
              const isCurrent = c.key === currentCategoryKey;
              const label = labelMap[c.key] ?? c.key;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c)}
                  title={label}
                  className={
                    'flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-slate-100 transition-colors ' +
                    (isCurrent ? 'bg-violet-50 ring-1 ring-violet-300' : '')
                  }
                >
                  <span className="text-base">{c.icon ?? '📦'}</span>
                  <span className="text-[9px] text-slate-600 truncate w-full text-center">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => handlePick(null)}
            className="mt-2 w-full text-[11px] text-slate-500 hover:text-slate-700 py-1"
          >
            {t.transactions.clearCategory}
          </button>
        </PopoverContent>
      </Popover>

      {similarOpen && similarCategoryId && (
        <ApplyToSimilarDialog
          open={similarOpen}
          onOpenChange={setSimilarOpen}
          categoryId={similarCategoryId}
          categoryKey={similarCategoryKey}
          categoryIcon={similarCategoryIcon}
          categoryLabel={similarCategoryLabel}
          matches={similarMatches}
        />
      )}
    </>
  );
}
