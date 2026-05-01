'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GoalForm } from './goal-form';
import { t } from '@/lib/i18n/he';

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

type Props = {
  goal: Goal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditGoalDialog({ goal, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.goals.editGoalTitle}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pe-1">
          <GoalForm
            initial={{
              id: goal.id,
              name: goal.name,
              targetAmount: parseFloat(goal.targetAmount),
              currentAmount: parseFloat(goal.currentAmount),
              targetDate: goal.targetDate,
              monthlyContribution: goal.monthlyContribution
                ? parseFloat(goal.monthlyContribution)
                : null,
              icon: goal.icon ?? '🎯',
              color: goal.color ?? '#7C3AED',
            }}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
