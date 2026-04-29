import { formatDate, formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { TransactionRow } from '../queries';

type Props = {
  transactions: TransactionRow[];
};

export function TransactionsTable({ transactions }: Props) {
  const groups = groupByMonth(transactions);

  return (
    <div className="space-y-6">
      {groups.map(({ month, txs }) => (
        <div key={month}>
          <h2 className="text-sm font-semibold text-slate-600 mb-2">{month}</h2>
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {txs.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} />
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionItem({ tx }: { tx: TransactionRow }) {
  const amount = parseFloat(tx.amount);
  const isExpense = amount < 0;

  return (
    <li className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
      <div className="size-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg shrink-0">
        {tx.categoryIcon ?? '📦'}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="font-medium truncate"
          style={{ unicodeBidi: 'plaintext' }}
        >
          <bdi>{tx.description}</bdi>
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
          <span>{formatDate(tx.date)}</span>
          <span>•</span>
          <span className="truncate">{tx.accountDisplayName}</span>
          {tx.installmentNumber && tx.installmentTotal && (
            <>
              <span>•</span>
              <span className="text-violet-600">
                {template(t.transactions.installment, {
                  n: tx.installmentNumber,
                  total: tx.installmentTotal,
                })}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className={`font-semibold tabular-nums shrink-0 ${
          isExpense ? 'text-slate-900' : 'text-emerald-600'
        }`}
      >
        <bdi>{formatILS(amount)}</bdi>
      </div>
    </li>
  );
}

function groupByMonth(transactions: TransactionRow[]) {
  const map = new Map<string, TransactionRow[]>();
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
