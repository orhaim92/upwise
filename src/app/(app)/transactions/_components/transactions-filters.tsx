'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t } from '@/lib/i18n/he';

type Props = {
  accounts: { id: string; displayName: string }[];
};

export function TransactionsFilters({ accounts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set('search', search);
      else next.delete('search');
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    setSearch('');
    router.replace(pathname);
  }

  const hasFilters = Array.from(params.keys()).length > 0;

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.transactions.search}
            className="ps-9"
          />
        </div>

        <Select
          value={params.get('accountId') ?? 'all'}
          onValueChange={(v) => setParam('accountId', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t.transactions.filterAccount} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.transactions.filterAccountAll}</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.get('type') ?? 'all'}
          onValueChange={(v) => setParam('type', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t.transactions.filterType} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.transactions.filterTypeAll}</SelectItem>
            <SelectItem value="income">{t.transactions.filterTypeIncome}</SelectItem>
            <SelectItem value="expense">{t.transactions.filterTypeExpense}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs text-slate-600 block mb-1">
            {t.transactions.filterDateFrom}
          </label>
          <Input
            type="date"
            value={params.get('startDate') ?? ''}
            onChange={(e) => setParam('startDate', e.target.value || null)}
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1">
            {t.transactions.filterDateTo}
          </label>
          <Input
            type="date"
            value={params.get('endDate') ?? ''}
            onChange={(e) => setParam('endDate', e.target.value || null)}
          />
        </div>
        {hasFilters && (
          <div className="flex items-end">
            <Button variant="outline" onClick={clearAll} className="w-full">
              <X className="size-4" />
              {t.transactions.filterClear}
            </Button>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={params.get('showSpecial') === '1'}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.checked) next.set('showSpecial', '1');
            else next.delete('showSpecial');
            router.replace(`${pathname}?${next.toString()}`);
          }}
          className="size-4 rounded border-slate-300 accent-violet-600"
        />
        {t.transactions.showSpecial}
      </label>
    </div>
  );
}
