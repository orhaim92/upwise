import { RuleRow } from './rule-row';
import { t } from '@/lib/i18n/he';

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
}: {
  rules: Rule[];
  categories: Category[];
}) {
  if (rules.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
        <p className="text-slate-500">{t.recurring.empty}</p>
      </div>
    );
  }

  const income = rules.filter((r) => r.type === 'income');
  const expense = rules.filter((r) => r.type === 'expense');

  return (
    <div className="space-y-6">
      {income.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">
            {t.recurring.income}
          </h2>
          <div className="space-y-2">
            {income.map((r) => (
              <RuleRow key={r.id} rule={r} categories={categories} />
            ))}
          </div>
        </section>
      )}

      {expense.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">
            {t.recurring.expense}
          </h2>
          <div className="space-y-2">
            {expense.map((r) => (
              <RuleRow key={r.id} rule={r} categories={categories} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
