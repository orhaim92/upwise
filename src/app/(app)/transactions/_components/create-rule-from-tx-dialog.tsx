'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RuleForm } from '@/app/(app)/recurring/_components/rule-form';
import { normalizeDescription } from '@/lib/transactions/normalize';
import { t } from '@/lib/i18n/he';

type Category = {
  id: string;
  key: string;
  icon: string | null;
};

type Props = {
  transaction: {
    id: string;
    description: string;
    amount: string;
  };
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateRuleFromTxDialog({
  transaction,
  categories,
  open,
  onOpenChange,
}: Props) {
  const amount = parseFloat(transaction.amount);
  const isIncome = amount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recurring.createFromTxTitle}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pe-1">
          <RuleForm
            categories={categories}
            initial={{
              name: transaction.description.slice(0, 100),
              type: isIncome ? 'income' : 'expense',
              expectedAmount: Math.abs(amount),
              amountTolerancePct: 15,
              frequency: 'monthly',
              matchPattern: normalizeDescription(transaction.description),
              isActive: true,
            }}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
