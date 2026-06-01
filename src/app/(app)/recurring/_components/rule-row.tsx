'use client';

import { useState, useTransition } from 'react';
import { CalendarX, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteRule } from '../actions';
import { skipRuleForCycle, unskipRuleForCycle } from '../skip-actions';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import { EditRuleDialog } from './edit-rule-dialog';

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

export function RuleRow({
  rule,
  categories,
  skippedNextCycle = false,
}: {
  rule: Rule;
  categories: Category[];
  skippedNextCycle?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(t.recurring.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteRule(rule.id);
      if (!result.ok) toast.error(result.error);
      else toast.success(t.recurring.ruleDeleted);
    });
  }

  function handleToggleNextCycleSkip() {
    startTransition(async () => {
      const r = skippedNextCycle
        ? await unskipRuleForCycle({ ruleId: rule.id, cycleOffset: 1 })
        : await skipRuleForCycle({ ruleId: rule.id, cycleOffset: 1 });
      if (!r.ok) toast.error(r.error);
      else
        toast.success(
          skippedNextCycle
            ? t.nextCycle.ruleUnskipped
            : t.nextCycle.ruleSkipped,
        );
    });
  }

  const freqLabel =
    (t.recurring as Record<string, string>)[`freq_${rule.frequency}`] ??
    rule.frequency;
  const amount = parseFloat(rule.expectedAmount);

  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-white rounded-xl ring-1 ring-slate-200">
        <div className="flex-1 min-w-0">
          <p
            className="font-medium truncate"
            style={{ unicodeBidi: 'plaintext' }}
          >
            <bdi>{rule.name}</bdi>
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {freqLabel}
            {' • '}
            <bdi>{formatILS(amount)}</bdi>
            {!rule.isActive && ' • לא פעיל'}
            {rule.remainingOccurrences != null &&
              ` • ${rule.remainingOccurrences} שנותרו`}
            {skippedNextCycle && (
              <span className="text-amber-600"> • {t.nextCycle.skippedTag}</span>
            )}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleToggleNextCycleSkip}
          disabled={pending}
          aria-label={
            skippedNextCycle ? t.nextCycle.unskip : t.nextCycle.skip
          }
          title={skippedNextCycle ? t.nextCycle.unskip : t.nextCycle.skip}
        >
          {skippedNextCycle ? (
            <RotateCcw className="size-4 text-amber-600" />
          ) : (
            <CalendarX className="size-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label={t.recurring.edit}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={pending}
          aria-label={t.recurring.delete}
        >
          <Trash2 className="size-4 text-rose-600" />
        </Button>
      </div>

      <EditRuleDialog
        rule={rule}
        categories={categories}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}
