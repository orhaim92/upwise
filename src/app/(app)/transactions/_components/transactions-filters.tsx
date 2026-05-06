'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { t } from '@/lib/i18n/he';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  accounts: { id: string; displayName: string }[];
  categories: Category[];
  // When the URL has ?cycle=N, the page resolves it to a specific billing
  // cycle and passes the offset back so the picker can highlight the active
  // option. Undefined when no cycle filter is active.
  activeCycleOffset?: number;
};

const TYPE_LABELS: Record<string, string> = {
  all: '',
  income: '',
  expense: '',
};

const UNCATEGORIZED_KEY = 'uncategorized';

export function TransactionsFilters({
  accounts,
  categories,
  activeCycleOffset,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');

  // Initialize Hebrew labels at runtime so this static map stays consumable.
  TYPE_LABELS.all = t.transactions.filterTypeAll;
  TYPE_LABELS.income = t.transactions.filterTypeIncome;
  TYPE_LABELS.expense = t.transactions.filterTypeExpense;

  const categoryLabels =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

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

  function toggleAccount(id: string) {
    const current =
      params.get('accountIds')?.split(',').filter(Boolean) ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    const nextParams = new URLSearchParams(params);
    if (next.length > 0) nextParams.set('accountIds', next.join(','));
    else nextParams.delete('accountIds');
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  function setCycle(offset: number | null) {
    const next = new URLSearchParams(params);
    if (offset === null) {
      next.delete('cycle');
    } else {
      next.set('cycle', String(offset));
      // The cycle takes precedence over manual date inputs, so clear them
      // to avoid a confusing UI showing both at once.
      next.delete('startDate');
      next.delete('endDate');
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function toggleCategory(key: string) {
    const current =
      params.get('categoryKeys')?.split(',').filter(Boolean) ?? [];
    const next = current.includes(key)
      ? current.filter((x) => x !== key)
      : [...current, key];
    const nextParams = new URLSearchParams(params);
    if (next.length > 0) nextParams.set('categoryKeys', next.join(','));
    else nextParams.delete('categoryKeys');
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  function clearAll() {
    setSearch('');
    router.replace(pathname);
  }

  const hasFilters = Array.from(params.keys()).length > 0;

  const selectedIds = (params.get('accountIds')?.split(',') ?? []).filter(
    Boolean,
  );
  const selectedAccounts = accounts.filter((a) => selectedIds.includes(a.id));

  let accountTriggerLabel: string;
  if (selectedAccounts.length === 0) {
    accountTriggerLabel = t.transactions.filterAccountAll;
  } else if (selectedAccounts.length === 1) {
    accountTriggerLabel = selectedAccounts[0].displayName;
  } else if (selectedAccounts.length === accounts.length) {
    accountTriggerLabel = t.transactions.filterAccountAll;
  } else {
    accountTriggerLabel = t.transactions.filterAccountCount.replace(
      '{n}',
      String(selectedAccounts.length),
    );
  }

  const currentType = params.get('type') ?? 'all';

  const selectedCategoryKeys = (
    params.get('categoryKeys')?.split(',') ?? []
  ).filter(Boolean);

  let categoryTriggerLabel: string;
  if (selectedCategoryKeys.length === 0) {
    categoryTriggerLabel = t.transactions.filterCategoryAll;
  } else if (selectedCategoryKeys.length === 1) {
    const k = selectedCategoryKeys[0];
    categoryTriggerLabel =
      k === UNCATEGORIZED_KEY
        ? t.transactions.filterCategoryUncategorized
        : (categoryLabels[k] ?? k);
  } else {
    categoryTriggerLabel = t.transactions.filterCategoryCount.replace(
      '{n}',
      String(selectedCategoryKeys.length),
    );
  }

  // Cycle quick-pick options. Just current / previous / 2-back; deeper history
  // is rare on this page (users with that need use the date inputs directly).
  const cycleOptions: Array<{ offset: number | null; label: string }> = [
    { offset: null, label: t.transactions.filterCycleAll },
    { offset: 0, label: t.transactions.filterCycleCurrent },
    { offset: -1, label: t.transactions.filterCyclePrev },
    {
      offset: -2,
      label: t.transactions.filterCycleBack.replace('{n}', '2'),
    },
    {
      offset: -3,
      label: t.transactions.filterCycleBack.replace('{n}', '3'),
    },
  ];

  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
      {/* Cycle quick-pick — sits first so it's visible at a glance. Selecting
          a cycle clears any manual startDate/endDate, since the cycle bounds
          take precedence on the server side. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 shrink-0">
          {t.transactions.filterCycle}:
        </span>
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 flex-wrap gap-0.5">
          {cycleOptions.map((opt) => {
            const isActive =
              opt.offset === null
                ? activeCycleOffset === undefined
                : activeCycleOffset === opt.offset;
            return (
              <button
                key={opt.offset === null ? 'all' : String(opt.offset)}
                type="button"
                onClick={() => setCycle(opt.offset)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.transactions.searchPlaceholder}
            className="ps-9"
          />
        </div>

        {/* Multi-select account filter */}
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 ps-2.5 pe-2 text-sm h-8"
              >
                <span className="truncate text-start flex-1">
                  {accountTriggerLabel}
                </span>
                <ChevronDown className="size-4 text-slate-400 shrink-0" />
              </button>
            }
          />
          <PopoverContent align="start" className="w-64 p-1">
            <ul className="max-h-72 overflow-y-auto">
              {accounts.map((a) => {
                const checked = selectedIds.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-slate-100 text-start"
                    >
                      <span
                        className={
                          'size-4 rounded border flex items-center justify-center shrink-0 ' +
                          (checked
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : 'border-slate-300')
                        }
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <span className="truncate">{a.displayName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selectedIds.length > 0 && (
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete('accountIds');
                    router.replace(`${pathname}?${next.toString()}`);
                  }}
                  className="w-full text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5 text-start"
                >
                  {t.transactions.filterAccountClear}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Select
          value={currentType}
          onValueChange={(v) => setParam('type', v === 'all' ? null : v ?? null)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t.transactions.filterType}>
              {TYPE_LABELS[currentType] ?? t.transactions.filterType}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t.transactions.filterTypeAll}
            </SelectItem>
            <SelectItem value="income">
              {t.transactions.filterTypeIncome}
            </SelectItem>
            <SelectItem value="expense">
              {t.transactions.filterTypeExpense}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {/* Multi-select category filter — sits with the rest of the
            "narrow the data down" controls; sort lives outside the card. */}
        <div>
          <label className="text-xs text-slate-600 block mb-1">
            {t.transactions.filterCategory}
          </label>
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 ps-2.5 pe-2 text-sm h-8"
                >
                  <span className="truncate text-start flex-1">
                    {categoryTriggerLabel}
                  </span>
                  <ChevronDown className="size-4 text-slate-400 shrink-0" />
                </button>
              }
            />
            <PopoverContent align="start" className="w-72 p-1">
              <ul className="max-h-80 overflow-y-auto">
                <li>
                  <button
                    type="button"
                    onClick={() => toggleCategory(UNCATEGORIZED_KEY)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-slate-100 text-start"
                  >
                    <span
                      className={
                        'size-4 rounded border flex items-center justify-center shrink-0 ' +
                        (selectedCategoryKeys.includes(UNCATEGORIZED_KEY)
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'border-slate-300')
                      }
                    >
                      {selectedCategoryKeys.includes(UNCATEGORIZED_KEY) && (
                        <Check className="size-3" />
                      )}
                    </span>
                    <span className="text-base shrink-0">📦</span>
                    <span className="truncate text-slate-700">
                      {t.transactions.filterCategoryUncategorized}
                    </span>
                  </button>
                </li>
                {categories.map((c) => {
                  const checked = selectedCategoryKeys.includes(c.key);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(c.key)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-slate-100 text-start"
                      >
                        <span
                          className={
                            'size-4 rounded border flex items-center justify-center shrink-0 ' +
                            (checked
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'border-slate-300')
                          }
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="text-base shrink-0">
                          {c.icon ?? '📦'}
                        </span>
                        <span className="truncate">
                          {categoryLabels[c.key] ?? c.key}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selectedCategoryKeys.length > 0 && (
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.delete('categoryKeys');
                      router.replace(`${pathname}?${next.toString()}`);
                    }}
                    className="w-full text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5 text-start"
                  >
                    {t.transactions.filterCategoryClear}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

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
