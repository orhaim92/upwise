'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { differenceInMonths, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deleteGoal } from '../actions';
import { formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import { EditGoalDialog } from './edit-goal-dialog';

type Goal = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  monthlyContribution: string | null;
  icon: string | null;
  color: string | null;
};

export function GoalCard({ goal }: { goal: Goal }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const target = parseFloat(goal.targetAmount);
  const current = parseFloat(goal.currentAmount);
  const monthly = goal.monthlyContribution
    ? parseFloat(goal.monthlyContribution)
    : 0;
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const reached = current >= target;

  let dateText: string | null = null;
  if (goal.targetDate) {
    const target = new Date(goal.targetDate);
    const months = differenceInMonths(target, new Date());
    const days = differenceInDays(target, new Date());
    if (months >= 1) {
      dateText = template(t.goals.monthsRemaining, { n: months });
    } else if (days >= 0) {
      dateText = template(t.goals.daysRemaining, { n: days });
    }
  }

  function handleDelete() {
    if (!confirm(t.goals.deleteConfirm)) return;
    startTransition(async () => {
      const result = await deleteGoal(goal.id);
      if (!result.ok) toast.error(result.error);
      else toast.success(t.goals.goalDeleted);
    });
  }

  const accent = goal.color ?? '#7C3AED';

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className="size-10 rounded-lg flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              {goal.icon ?? '🎯'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold truncate">{goal.name}</h3>
              {dateText && (
                <p className="text-xs text-slate-500 mt-0.5">{dateText}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label={t.goals.empty}
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
        </div>

        <div className="mt-4">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: accent,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="tabular-nums text-slate-700">
              <bdi>{formatILS(current)}</bdi>
              {' / '}
              <bdi>{formatILS(target)}</bdi>
            </span>
            {reached && (
              <span className="text-emerald-600 font-medium">
                {t.goals.reachedTarget}
              </span>
            )}
          </div>
        </div>

        {monthly > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {t.goals.monthlyContribution}: <bdi>{formatILS(monthly)}</bdi>
          </p>
        )}
      </Card>

      <EditGoalDialog
        goal={goal}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}
