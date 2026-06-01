'use client';

import { useTransition } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { CyclePreviewItem } from '@/lib/cycles/cycle-preview';
import {
  skipRuleForCycle,
  unskipRuleForCycle,
} from '../../recurring/skip-actions';

type Props = {
  items: CyclePreviewItem[];
  totalExpense: number;
  totalIncome: number;
  cycleLabel: string;
};

export function NextCyclePreview({
  items,
  totalExpense,
  totalIncome,
  cycleLabel,
}: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-semibold">{t.nextCycle.title}</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {cycleLabel}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-3">{t.nextCycle.subtitle}</p>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">{t.nextCycle.empty}</p>
      ) : (
        <>
          <div className="space-y-0">
            {items.map((item) => (
              <PreviewItemRow key={item.id} item={item} />
            ))}
          </div>

          <div className="border-t-2 border-slate-200 pt-2 mt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {t.nextCycle.totalExpense}
              </span>
              <span className="tabular-nums font-semibold">
                <bdi>{`-${formatILS(totalExpense)}`}</bdi>
              </span>
            </div>
            {totalIncome > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {t.nextCycle.totalIncome}
                </span>
                <span className="tabular-nums font-semibold text-emerald-600">
                  <bdi>{`+${formatILS(totalIncome)}`}</bdi>
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function PreviewItemRow({ item }: { item: CyclePreviewItem }) {
  const [pending, startTransition] = useTransition();
  const sign = item.type === 'income' ? '+' : '-';

  function handleSkip() {
    startTransition(async () => {
      const r = await skipRuleForCycle({ ruleId: item.id, cycleOffset: 1 });
      if (!r.ok) toast.error(r.error);
      else toast.success(t.nextCycle.ruleSkipped);
    });
  }

  function handleUnskip() {
    startTransition(async () => {
      const r = await unskipRuleForCycle({ ruleId: item.id, cycleOffset: 1 });
      if (!r.ok) toast.error(r.error);
      else toast.success(t.nextCycle.ruleUnskipped);
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`truncate ${
            item.skipped ? 'text-slate-400 line-through' : 'text-slate-700'
          }`}
          style={{ unicodeBidi: 'plaintext' }}
        >
          <bdi>{item.name}</bdi>
        </span>
        {item.skipped && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
            {t.nextCycle.skippedTag}
          </span>
        )}
      </div>

      <span
        className={`tabular-nums shrink-0 ${
          item.skipped
            ? 'text-slate-400 line-through'
            : item.type === 'income'
              ? 'text-emerald-600'
              : 'text-slate-700'
        }`}
      >
        <bdi>{`${sign}${formatILS(item.amount)}`}</bdi>
      </span>

      {item.skipped ? (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleUnskip}
          disabled={pending}
          aria-label={t.nextCycle.unskip}
          title={t.nextCycle.unskip}
        >
          <RotateCcw className="size-4" />
        </Button>
      ) : (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleSkip}
          disabled={pending}
          aria-label={t.nextCycle.skip}
          title={t.nextCycle.skip}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
