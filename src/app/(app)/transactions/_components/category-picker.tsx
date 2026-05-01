'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { setTransactionCategory } from '../actions';
import { cn } from '@/lib/utils';
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
  currentCategoryIcon: string | null;
  categories: Category[];
};

export function CategoryPicker({
  transactionId,
  currentCategoryKey,
  currentCategoryIcon,
  categories,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimisticIcon, setOptimisticIcon] = useState<string | null>(
    currentCategoryIcon,
  );

  function handlePick(categoryId: string | null, icon: string | null) {
    setOptimisticIcon(icon);
    setOpen(false);
    startTransition(async () => {
      const result = await setTransactionCategory({
        transactionId,
        categoryId,
      });
      if (!result.ok) {
        toast.error(result.error ?? t.common.error);
        setOptimisticIcon(currentCategoryIcon);
        return;
      }
      toast.success(t.transactions.categoryUpdated);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={pending}
        aria-label={t.transactions.chooseCategory}
        suppressHydrationWarning
        className={cn(
          'size-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg shrink-0 hover:ring-2 hover:ring-violet-300 transition-shadow',
          pending && 'opacity-50',
        )}
      >
        {optimisticIcon ?? '📦'}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="text-xs font-semibold text-slate-600 mb-2">
          {t.transactions.chooseCategory}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {categories.map((cat) => {
            const isSelected = cat.key === currentCategoryKey;
            const label =
              (t.categoryLabels as Record<string, string>)[cat.key] ?? cat.key;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handlePick(cat.id, cat.icon)}
                title={label}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-100 transition-colors',
                  isSelected && 'bg-violet-50 ring-1 ring-violet-300',
                )}
              >
                <span className="text-lg">{cat.icon ?? '📦'}</span>
                <span className="text-[10px] text-slate-600 truncate w-full text-center">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => handlePick(null, null)}
          className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 py-1"
        >
          {t.transactions.clearCategory}
        </button>
      </PopoverContent>
    </Popover>
  );
}
