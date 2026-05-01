'use client';

import { useTransition } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { approveRule, rejectRule } from '../actions';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';

type Rule = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  expectedAmount: string;
  frequency: string;
};

export function PendingSuggestions({ rules }: { rules: Rule[] }) {
  return (
    <Card className="p-5 bg-violet-50 ring-1 ring-violet-200">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-5 text-violet-600" />
        <div>
          <h2 className="font-semibold">{t.recurring.pendingTitle}</h2>
          <p className="text-sm text-slate-600">{t.recurring.pendingSubtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        {rules.map((rule) => (
          <SuggestionRow key={rule.id} rule={rule} />
        ))}
      </div>
    </Card>
  );
}

function SuggestionRow({ rule }: { rule: Rule }) {
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      const r = await approveRule(rule.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.recurring.ruleApproved);
    });
  }

  function handleReject() {
    startTransition(async () => {
      const r = await rejectRule(rule.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.recurring.ruleRejected);
    });
  }

  const freqLabel =
    (t.recurring as Record<string, string>)[`freq_${rule.frequency}`] ??
    rule.frequency;
  const amount = parseFloat(rule.expectedAmount);

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
      <div className="flex-1 min-w-0">
        <p
          className="font-medium truncate"
          style={{ unicodeBidi: 'plaintext' }}
        >
          <bdi>{rule.name}</bdi>
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          {rule.type === 'income' ? t.recurring.income : t.recurring.expense}
          {' • '}
          {freqLabel}
          {' • '}
          <bdi>{formatILS(amount)}</bdi>
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleApprove}
        disabled={pending}
        className="text-emerald-600 hover:text-emerald-700"
        aria-label={t.recurring.approve}
      >
        <Check className="size-5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleReject}
        disabled={pending}
        className="text-rose-600 hover:text-rose-700"
        aria-label={t.recurring.reject}
      >
        <X className="size-5" />
      </Button>
    </div>
  );
}
