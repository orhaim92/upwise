import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { type DailyAllowance } from '@/lib/cycles/daily-allowance';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import { BreakdownRow } from './breakdown-row';
import { AddManualItemDialog } from './add-manual-item-dialog';

export function CycleMathCard({
  allowance,
}: {
  allowance: DailyAllowance;
}) {
  const { isOverBudget, isLowBalance, availableToSpend } = allowance;

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3">{t.dashboard.cycleSummary}</h3>

      {(isOverBudget || isLowBalance) && (
        <div
          className={`flex items-start gap-2 p-3 mb-3 rounded-lg text-sm ${
            isOverBudget
              ? 'bg-rose-50 text-rose-900'
              : 'bg-amber-50 text-amber-900'
          }`}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            {isOverBudget
              ? t.allowance.overBudgetWarning
              : t.allowance.lowBalanceWarning}
          </span>
        </div>
      )}

      <div className="space-y-0">
        <BreakdownRow
          label={t.allowance.currentBalance}
          totalAmount={allowance.currentTotalBalance}
          items={allowance.balanceBreakdown}
          bold
        />

        <BreakdownRow
          label={t.allowance.expectedRemainingIncome}
          totalAmount={allowance.expectedRemainingIncome}
          items={allowance.expectedRemainingIncomeBreakdown}
          signed="+"
          positive
        />

        <BreakdownRow
          label={t.allowance.manualIncome}
          totalAmount={allowance.manualOneTimeIncome}
          items={allowance.manualOneTimeIncomeBreakdown}
          signed="+"
          positive
          emptyMessage={t.allowance.noItems}
        />
        <div className="flex justify-end -mt-1 mb-1 pe-2">
          <AddManualItemDialog type="income" />
        </div>

        <BreakdownRow
          label={t.allowance.expectedRemainingRecurring}
          totalAmount={allowance.expectedRemainingRecurringExpenses}
          items={allowance.expectedRemainingRecurringExpensesBreakdown}
          signed="-"
        />

        <BreakdownRow
          label={t.allowance.manualExpenses}
          totalAmount={allowance.manualOneTimeExpenses}
          items={allowance.manualOneTimeExpensesBreakdown}
          signed="-"
          emptyMessage={t.allowance.noItems}
        />
        <div className="flex justify-end -mt-1 mb-1 pe-2">
          <AddManualItemDialog type="expense" />
        </div>

        <BreakdownRow
          label={t.allowance.savingsCommitment}
          totalAmount={allowance.savingsCommitmentRemainingInCycle}
          items={allowance.savingsBreakdown}
          signed="-"
        />

        <div className="border-t-2 border-slate-200 pt-2 mt-2">
          <div className="flex items-center justify-between py-2">
            <span className="font-bold">{t.allowance.availableToSpend}</span>
            <span
              className={`font-bold tabular-nums ${
                availableToSpend < 0 ? 'text-rose-600' : ''
              }`}
            >
              <bdi>{formatILS(availableToSpend)}</bdi>
            </span>
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
          {t.allowance.cycleSoFar}
        </summary>
        <div className="mt-2">
          <BreakdownRow
            label={t.allowance.incomeRealizedToDate}
            totalAmount={allowance.incomeRealizedToDate}
            items={allowance.realizedIncomeBreakdown}
            signed="+"
            positive
          />
          <BreakdownRow
            label={t.allowance.expensesRealizedToDate}
            totalAmount={allowance.expensesRealizedToDate}
            items={allowance.realizedExpensesBreakdown}
            signed="-"
          />
        </div>
      </details>
    </Card>
  );
}
