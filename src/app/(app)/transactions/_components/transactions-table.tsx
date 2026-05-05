'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDate, formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type {
  TransactionFilters,
  TransactionRow,
  TransactionRowGrouped,
} from '../queries';
import { loadMoreTransactions } from '../actions';
import { TransactionRowCard } from './transaction-row-card';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  initialTransactions: TransactionRowGrouped[];
  filters: TransactionFilters;
  pageSize: number;
  categories: Category[];
};

export function TransactionsTable({
  initialTransactions,
  filters,
  pageSize,
  categories,
}: Props) {
  // Cumulative list as the user scrolls deeper. Server-side filtering
  // applies to the FULL dataset; we just render a growing window.
  const [rows, setRows] = useState(initialTransactions);
  const [hasMore, setHasMore] = useState(
    initialTransactions.length === pageSize,
  );
  const [loading, setLoading] = useState(false);

  // Month buckets only make sense for date-sorted data. With amount/category
  // sort, rows from different months would interleave inside one month
  // header — confusing. Render flat in those cases.
  const sortedByDate = !filters.sort || filters.sort === 'date';
  const groups = sortedByDate
    ? groupByMonth(rows)
    : [{ month: '', txs: rows }];

  async function handleLoadMore() {
    setLoading(true);
    try {
      const r = await loadMoreTransactions({
        ...filters,
        offset: rows.length,
        limit: pageSize,
      });
      if (!r.ok || !r.rows) {
        toast.error(r.error ?? t.common.error);
        return;
      }
      setRows((prev) => [...prev, ...r.rows!]);
      setHasMore(r.hasMore ?? false);
    } finally {
      setLoading(false);
    }
  }

  // Client-side patch for the "apply to similar" bulk update. We avoided
  // server-driven revalidation here (it raced with the dialog's portal
  // cleanup and crashed hydration), so the table updates its own row
  // snapshot when the dialog reports success. Walks both top-level rows
  // and aggregate children — a CC line item could match the bulk set.
  function applyBulkCategory(
    ids: string[],
    categoryKey: string,
    categoryIcon: string | null,
  ) {
    const idSet = new Set(ids);
    setRows((prev) =>
      prev.map((row) => {
        let updated = row;
        if (idSet.has(row.id)) {
          updated = { ...updated, categoryKey, categoryIcon };
        }
        if (updated.children && updated.children.length > 0) {
          const newChildren = updated.children.map((c) =>
            idSet.has(c.id) ? { ...c, categoryKey, categoryIcon } : c,
          );
          updated = { ...updated, children: newChildren };
        }
        return updated;
      }),
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ month, txs }) => (
        <div key={month || 'flat'}>
          {month && (
            <h2 className="text-sm font-semibold text-slate-600 mb-2">
              {month}
            </h2>
          )}
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {txs.map((tx) => {
                if (tx.isAggregatedCharge) {
                  return (
                    <AggregateRow
                      key={tx.id}
                      tx={tx}
                      categories={categories}
                      onBulkApplied={applyBulkCategory}
                    />
                  );
                }
                return (
                  <li key={tx.id}>
                    <TransactionRowCard
                      tx={tx}
                      categories={categories}
                      onBulkApplied={applyBulkCategory}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            onClick={handleLoadMore}
            disabled={loading}
            variant="outline"
            className="min-w-[10rem]"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? t.common.loading : t.transactions.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}

function AggregateRow({
  tx,
  categories,
  onBulkApplied,
}: {
  tx: TransactionRowGrouped;
  categories: Category[];
  onBulkApplied: (
    ids: string[],
    categoryKey: string,
    categoryIcon: string | null,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const parentAmount = Math.abs(parseFloat(tx.amount));
  const childrenCount = tx.children?.length ?? 0;
  const childrenSum = tx.childrenSum ?? 0;
  const sumMismatch =
    childrenCount > 0 &&
    parentAmount > 0 &&
    Math.abs(childrenSum - parentAmount) / parentAmount > 0.05;

  return (
    <li>
      <div
        onClick={() => childrenCount > 0 && setExpanded((e) => !e)}
        className={`flex items-center gap-4 p-4 transition-colors bg-violet-50/30 ${
          childrenCount > 0 ? 'cursor-pointer hover:bg-slate-50' : ''
        }`}
      >
        <div className="size-10 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0">
          <CreditCard className="size-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium" style={{ unicodeBidi: 'plaintext' }}>
            <bdi>
              {template(t.transactions.aggregateChargeLabel, {
                provider: tx.accountDisplayName,
              })}
            </bdi>
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
            <span>{formatDate(tx.date)}</span>
            <span>•</span>
            <span className="truncate">{tx.accountDisplayName}</span>
            {childrenCount > 0 ? (
              <>
                <span>•</span>
                <span className="text-violet-600 inline-flex items-center gap-1">
                  {expanded ? (
                    <>
                      <ChevronUp className="size-3" />
                      {t.transactions.collapseAggregateRow}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3" />
                      {template(t.transactions.expandAggregateRow, {
                        count: childrenCount,
                      })}
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span>•</span>
                <span className="text-amber-600 inline-flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  {t.transactions.noCardLinked}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-slate-900 font-semibold tabular-nums shrink-0 text-end min-w-[6.5rem]">
          <bdi>{formatILS(parseFloat(tx.amount))}</bdi>
        </div>
      </div>

      {expanded && tx.children && (
        <div className="bg-slate-50 border-s-4 border-violet-200">
          {sumMismatch && (
            <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <AlertTriangle className="size-3 shrink-0" />
              <span>
                סכום הפירוט ({formatILS(childrenSum)}) שונה מסכום החיוב.
                ייתכן שחסרות תנועות או שיש כאלה ששייכות לתקופה אחרת.
              </span>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {tx.children.map((child: TransactionRow) => (
              <li key={child.id}>
                <TransactionRowCard
                  tx={child}
                  categories={categories}
                  compact
                  onBulkApplied={onBulkApplied}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function groupByMonth(transactions: TransactionRowGrouped[]) {
  const map = new Map<string, TransactionRowGrouped[]>();
  for (const tx of transactions) {
    const date = new Date(tx.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, txs]) => {
      const [year, monthNum] = key.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const monthName = date.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
      });
      return { month: monthName, txs };
    });
}
