'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n/he';

const SORT_LABELS: Record<string, string> = {
  date: '',
  amount_asc: '',
  amount_desc: '',
  category: '',
};

export function TransactionsSort() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  SORT_LABELS.date = t.transactions.sortDate;
  SORT_LABELS.amount_asc = t.transactions.sortAmountLowHigh;
  SORT_LABELS.amount_desc = t.transactions.sortAmountHighLow;
  SORT_LABELS.category = t.transactions.sortCategory;

  const currentSort = params.get('sort') ?? 'date';

  function setSort(value: string | null) {
    const next = new URLSearchParams(params);
    if (value && value !== 'date') next.set('sort', value);
    else next.delete('sort');
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <ArrowUpDown className="size-4 text-slate-500 shrink-0" />
      <span className="text-sm text-slate-600 shrink-0">
        {t.transactions.sortLabel}:
      </span>
      <Select
        value={currentSort}
        onValueChange={(v) => setSort(v ?? null)}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder={t.transactions.sortLabel}>
            {SORT_LABELS[currentSort] ?? t.transactions.sortLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">{t.transactions.sortDate}</SelectItem>
          <SelectItem value="amount_asc">
            {t.transactions.sortAmountLowHigh}
          </SelectItem>
          <SelectItem value="amount_desc">
            {t.transactions.sortAmountHighLow}
          </SelectItem>
          <SelectItem value="category">{t.transactions.sortCategory}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
