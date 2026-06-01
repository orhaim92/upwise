import { RuleRow } from './rule-row';
import { t } from '@/lib/i18n/he';
import { formatILS } from '@/lib/format';
import { monthlyEquivalent } from '@/lib/recurring/monthly-equivalent';

type Rule = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  expectedAmount: string;
  amountTolerancePct: string;
  frequency:
    | 'weekly'
    | 'monthly'
    | 'bimonthly'
    | 'quarterly'
    | 'semiannual'
    | 'yearly'
    | 'custom';
  customIntervalDays: number | null;
  matchPattern: string | null;
  startDate: string | null;
  endDate: string | null;
  remainingOccurrences: number | null;
  isActive: boolean;
  categoryId: string | null;
};

type Category = {
  id: string;
  key: string;
  icon: string | null;
};

export function RulesList({
  rules,
  categories,
  skippedNextCycle = [],
}: {
  rules: Rule[];
  categories: Category[];
  skippedNextCycle?: string[];
}) {
  const skippedSet = new Set(skippedNextCycle);
  if (rules.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
        <p className="text-slate-500">{t.recurring.empty}</p>
      </div>
    );
  }

  const income = rules.filter((r) => r.type === 'income');
  const expense = rules.filter((r) => r.type === 'expense');

  // Monthly-equivalent totals so mixed frequencies (weekly / yearly / etc.)
  // sum into a comparable "per month" figure.
  const incomeMonthly = income.reduce(
    (s, r) => s + monthlyEquivalent(parseFloat(r.expectedAmount), r.frequency),
    0,
  );
  const expenseMonthly = expense.reduce(
    (s, r) => s + monthlyEquivalent(parseFloat(r.expectedAmount), r.frequency),
    0,
  );

  return (
    <div className="space-y-6">
      {income.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600">
              {t.recurring.income}
            </h2>
            <span className="text-sm font-semibold text-emerald-600 tabular-nums">
              {t.recurring.monthlyTotal}{' '}
              <bdi>{`+${formatILS(incomeMonthly)}`}</bdi>
            </span>
          </div>
          <div className="space-y-2">
            {income.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                categories={categories}
                skippedNextCycle={skippedSet.has(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      {expense.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600">
              {t.recurring.expense}
            </h2>
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
              {t.recurring.monthlyTotal}{' '}
              <bdi>{`-${formatILS(expenseMonthly)}`}</bdi>
            </span>
          </div>
          <div className="space-y-2">
            {expense.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                categories={categories}
                skippedNextCycle={skippedSet.has(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      {income.length > 0 && expense.length > 0 && (
        <div className="flex items-center justify-between border-t-2 border-slate-200 pt-3">
          <span className="text-sm font-semibold text-slate-600">
            {t.recurring.monthlyNet}
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              incomeMonthly - expenseMonthly < 0
                ? 'text-rose-600'
                : 'text-emerald-600'
            }`}
          >
            <bdi>{formatILS(incomeMonthly - expenseMonthly)}</bdi>
          </span>
        </div>
      )}
    </div>
  );
}
