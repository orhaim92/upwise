'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from 'lucide-react';
import { formatDate, formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { TransactionRow, TransactionRowGrouped } from '../queries';
import { TransactionRowCard } from './transaction-row-card';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  transactions: TransactionRowGrouped[];
  categories: Category[];
};

export function TransactionsTable({ transactions, categories }: Props) {
  const groups = groupByMonth(transactions);

  return (
    <div className="space-y-6">
      {groups.map(({ month, txs }) => (
        <div key={month}>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">{month}</h2>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {txs.map((tx) => {
                if (tx.isAggregatedCharge) {
                  return (
                    <AggregateRow
                      key={tx.id}
                      tx={tx}
                      categories={categories}
                    />
                  );
                }
                return (
                  <li key={tx.id}>
                    <TransactionRowCard tx={tx} categories={categories} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function AggregateRow({
  tx,
  categories,
}: {
  tx: TransactionRowGrouped;
  categories: Category[];
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
