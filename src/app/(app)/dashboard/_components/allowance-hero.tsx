import { AlertTriangle, MinusCircle } from 'lucide-react';
import { type DailyAllowance } from '@/lib/cycles/daily-allowance';
import { formatCycleRange } from '@/lib/cycles/billing-cycle';
import { formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';

type Props = {
  allowance: DailyAllowance;
  isStale: boolean;
};

export function AllowanceHero({ allowance, isStale }: Props) {
  const {
    cycle,
    dailyAllowance,
    isOverBudget,
    isCycleEnded,
    balanceAvailable,
    availableToSpend,
    isOverdraft,
    currentTotalBalance,
  } = allowance;

  if (!balanceAvailable) {
    return (
      <div className="bg-white rounded-3xl ring-1 ring-amber-200 p-8 text-center">
        <div className="flex items-center justify-center gap-2 text-amber-700 mb-3">
          <AlertTriangle className="size-5" />
          <span className="font-medium">
            {t.allowance.balanceUnavailableTitle}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          {t.allowance.balanceUnavailableBody}
        </p>
      </div>
    );
  }

  const isLowBalance = allowance.isLowBalance;

  const headline = isOverBudget
    ? template(t.allowance.overBudget, {
        amount: formatILS(Math.abs(availableToSpend)),
      })
    : isCycleEnded
      ? t.allowance.cycleEnded
      : isLowBalance
        ? t.allowance.lowBalanceWarning
        : t.allowance.todayCanSpend;

  const numberClass = isOverBudget
    ? 'text-rose-600'
    : isLowBalance
      ? 'text-amber-600'
      : isStale
        ? 'text-slate-400'
        : 'bg-gradient-to-l from-blue-500 to-violet-500 bg-clip-text text-transparent';

  return (
    <div className="bg-white rounded-3xl ring-1 ring-slate-200 p-8 text-center">
      <p className="text-sm text-slate-600">
        {template(t.allowance.cycleRange, { range: formatCycleRange(cycle) })}
        {' · '}
        {template(t.allowance.daysRemaining, { n: cycle.daysRemaining })}
      </p>

      <h2 className="text-sm font-medium text-slate-700 mt-4">{headline}</h2>

      <div
        className={`font-bold mt-2 tabular-nums leading-tight text-[clamp(2.25rem,11vw,3.75rem)] ${numberClass}`}
      >
        <bdi>
          {isCycleEnded || isOverBudget
            ? formatILS(0)
            : formatILS(dailyAllowance)}
        </bdi>
      </div>

      {/* Overdraft pill — shown only when bank balance is negative. The
          daily allowance above is computed as a budget delta, so it can
          look healthy even while the user is in the red. This pill keeps
          that fact visible without crushing the headline. */}
      {isOverdraft && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium ring-1 ring-rose-200">
          <MinusCircle className="size-3.5" />
          <span>
            {template(t.allowance.overdraftBadge, {
              amount: formatILS(Math.abs(currentTotalBalance)),
            })}
          </span>
        </div>
      )}
    </div>
  );
}
