'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  linkTransactionToRule,
  listRulesForLinking,
} from '../actions';
import { formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';

type Rule = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  expectedAmount: string;
};

type Props = {
  transactionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LinkRuleDialog({
  transactionId,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && rules.length === 0) {
      listRulesForLinking().then((r) => setRules(r));
    }
  }, [open, rules.length]);

  async function handleLink(ruleId: string) {
    setLoading(true);
    const r = await linkTransactionToRule({ transactionId, ruleId });
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const rule = rules.find((x) => x.id === ruleId);
    toast.success(
      template(t.transactions.linkedToRule, { name: rule?.name ?? '' }),
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.transactions.linkToRule}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {rules.map((rule) => (
            <button
              key={rule.id}
              onClick={() => handleLink(rule.id)}
              disabled={loading}
              type="button"
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors text-start"
            >
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-xs text-slate-500">
                  {rule.type === 'income'
                    ? t.recurring.income
                    : t.recurring.expense}
                </p>
              </div>
              <span className="tabular-nums text-sm">
                <bdi>{formatILS(Number(rule.expectedAmount))}</bdi>
              </span>
            </button>
          ))}
          {rules.length === 0 && (
            <p className="text-center text-slate-500 py-4">
              {t.recurring.empty}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
