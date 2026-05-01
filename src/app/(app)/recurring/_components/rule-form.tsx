'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  recurringRuleSchema,
  type RecurringRuleInput,
} from '@/lib/validations/recurring';
import { createRule, updateRule } from '../actions';
import { t } from '@/lib/i18n/he';

type Category = {
  id: string;
  key: string;
  icon: string | null;
};

type Props = {
  categories: Category[];
  initial?: Partial<RecurringRuleInput> & { id?: string };
  onSuccess?: () => void;
};

const FREQUENCIES = [
  'monthly',
  'bimonthly',
  'weekly',
  'quarterly',
  'semiannual',
  'yearly',
  'custom',
] as const;

export function RuleForm({ categories, initial, onSuccess }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initial?.id;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecurringRuleInput>({
    resolver: zodResolver(recurringRuleSchema),
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'expense',
      expectedAmount: initial?.expectedAmount ?? 0,
      amountTolerancePct: initial?.amountTolerancePct ?? 15,
      frequency: initial?.frequency ?? 'monthly',
      customIntervalDays: initial?.customIntervalDays ?? null,
      matchPattern: initial?.matchPattern ?? '',
      startDate: initial?.startDate ?? null,
      endDate: initial?.endDate ?? null,
      remainingOccurrences: initial?.remainingOccurrences ?? null,
      isActive: initial?.isActive ?? true,
      categoryId: initial?.categoryId ?? null,
    },
  });

  const type = watch('type');
  const frequency = watch('frequency');
  const isActive = watch('isActive');
  const categoryId = watch('categoryId');

  async function onSubmit(values: RecurringRuleInput) {
    setSubmitting(true);
    const cleaned = {
      ...values,
      matchPattern: values.matchPattern?.trim() || null,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      customIntervalDays:
        values.frequency === 'custom' ? values.customIntervalDays : null,
      remainingOccurrences: values.remainingOccurrences || null,
      categoryId: values.categoryId || null,
    };
    const result = isEdit
      ? await updateRule(initial!.id!, cleaned)
      : await createRule(cleaned);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isEdit ? t.recurring.ruleUpdated : t.recurring.ruleAdded);
    onSuccess?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="rule-name">{t.recurring.matchPattern}</Label>
        <Input id="rule-name" {...register('name')} />
        {errors.name && (
          <p className="text-xs text-rose-600">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t.recurring.type}</Label>
          <Select
            value={type}
            onValueChange={(v) =>
              setValue('type', (v ?? 'expense') as 'income' | 'expense', {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">{t.recurring.expense}</SelectItem>
              <SelectItem value="income">{t.recurring.income}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-amount">{t.recurring.expectedAmount}</Label>
          <Input
            id="rule-amount"
            type="number"
            step="0.01"
            dir="ltr"
            className="text-start"
            {...register('expectedAmount')}
          />
          {errors.expectedAmount && (
            <p className="text-xs text-rose-600">
              {errors.expectedAmount.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t.recurring.frequency}</Label>
          <Select
            value={frequency}
            onValueChange={(v) =>
              setValue(
                'frequency',
                (v ?? 'monthly') as RecurringRuleInput['frequency'],
                { shouldValidate: true },
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {(t.recurring as Record<string, string>)[`freq_${f}`]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-tolerance">{t.recurring.tolerance}</Label>
          <Input
            id="rule-tolerance"
            type="number"
            step="1"
            dir="ltr"
            className="text-start"
            {...register('amountTolerancePct')}
          />
        </div>
      </div>

      {frequency === 'custom' && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-custom-days">{t.recurring.customDays}</Label>
          <Input
            id="rule-custom-days"
            type="number"
            min={1}
            dir="ltr"
            className="text-start"
            {...register('customIntervalDays')}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rule-start">{t.recurring.startDate}</Label>
          <Input
            id="rule-start"
            type="date"
            {...register('startDate')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rule-end">{t.recurring.endDate}</Label>
          <Input id="rule-end" type="date" {...register('endDate')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rule-remaining">
          {t.recurring.remainingOccurrences}
        </Label>
        <Input
          id="rule-remaining"
          type="number"
          min={1}
          dir="ltr"
          className="text-start"
          {...register('remainingOccurrences')}
        />
        <p className="text-xs text-slate-500">
          {t.recurring.remainingOccurrencesHint}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rule-pattern">{t.recurring.matchPattern}</Label>
        <Input
          id="rule-pattern"
          {...register('matchPattern')}
          dir="ltr"
          className="text-start font-mono text-sm"
        />
        <p className="text-xs text-slate-500">{t.recurring.matchPatternHint}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t.recurring.category}</Label>
        <Select
          value={categoryId ?? 'none'}
          onValueChange={(v) =>
            setValue('categoryId', v === 'none' ? null : (v ?? null), {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t.recurring.none}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.icon} {(t.categoryLabels as Record<string, string>)[c.key] ?? c.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
        <Label htmlFor="rule-active" className="flex flex-col gap-0">
          <span>{t.recurring.active}</span>
        </Label>
        <Switch
          id="rule-active"
          checked={!!isActive}
          onCheckedChange={(checked) =>
            setValue('isActive', !!checked, { shouldValidate: true })
          }
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-violet-600 text-white hover:bg-violet-700"
      >
        {submitting ? t.common.saving : t.recurring.saveRule}
      </Button>
    </form>
  );
}
