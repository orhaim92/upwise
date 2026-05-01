'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RuleForm } from './rule-form';
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

type Props = {
  rule: Rule;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditRuleDialog({ rule, categories, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recurring.editRuleTitle}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pe-1">
          <RuleForm
            categories={categories}
            initial={{
              id: rule.id,
              name: rule.name,
              type: rule.type,
              expectedAmount: parseFloat(rule.expectedAmount),
              amountTolerancePct: parseFloat(rule.amountTolerancePct),
              frequency: rule.frequency,
              customIntervalDays: rule.customIntervalDays,
              matchPattern: rule.matchPattern,
              startDate: rule.startDate,
              endDate: rule.endDate,
              remainingOccurrences: rule.remainingOccurrences,
              isActive: rule.isActive,
              categoryId: rule.categoryId,
            }}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
