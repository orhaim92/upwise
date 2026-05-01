'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  savingsGoalSchema,
  type SavingsGoalInput,
} from '@/lib/validations/goals';
import { createGoal, updateGoal } from '../actions';
import { t } from '@/lib/i18n/he';
import { cn } from '@/lib/utils';

const ICONS = ['🎯', '✈️', '🏠', '🚗', '💍', '🎓', '👶', '💼', '🏖️'];
const COLORS = [
  '#7C3AED',
  '#3B82F6',
  '#059669',
  '#F59E0B',
  '#E11D48',
  '#EC4899',
  '#0EA5E9',
  '#14B8A6',
];

type Props = {
  initial?: Partial<SavingsGoalInput> & { id?: string };
  onSuccess?: () => void;
};

export function GoalForm({ initial, onSuccess }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!initial?.id;
  // Tracks whether the user has manually touched the monthly field. While
  // false, we keep auto-calculating it from target/current/date. As soon as
  // they type, we stop overwriting their value.
  const [monthlyEdited, setMonthlyEdited] = useState(
    initial?.monthlyContribution != null,
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SavingsGoalInput>({
    resolver: zodResolver(savingsGoalSchema),
    defaultValues: {
      name: initial?.name ?? '',
      targetAmount: initial?.targetAmount ?? 0,
      currentAmount: initial?.currentAmount ?? 0,
      targetDate: initial?.targetDate ?? null,
      monthlyContribution: initial?.monthlyContribution ?? null,
      icon: initial?.icon ?? '🎯',
      color: initial?.color ?? '#7C3AED',
    },
  });

  const icon = watch('icon');
  const color = watch('color');
  const targetAmount = watch('targetAmount');
  const currentAmount = watch('currentAmount');
  const monthlyContribution = watch('monthlyContribution');
  const targetDate = watch('targetDate');

  // Auto-calculate monthly contribution from (target - current) / months until
  // target date, while the user hasn't manually edited the field.
  useEffect(() => {
    if (monthlyEdited) return;
    if (!targetDate) return;
    const remaining = Number(targetAmount) - Number(currentAmount ?? 0);
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const msUntil = new Date(targetDate).getTime() - Date.now();
    if (!Number.isFinite(msUntil) || msUntil <= 0) return;
    const months = Math.max(1, Math.ceil(msUntil / (1000 * 60 * 60 * 24 * 30)));
    const auto = Math.ceil(remaining / months);
    setValue('monthlyContribution', auto, { shouldValidate: false });
  }, [targetAmount, currentAmount, targetDate, monthlyEdited, setValue]);

  // Inline warning if monthly contribution can't reach target by date
  let pacingWarning: string | null = null;
  if (
    targetDate &&
    monthlyContribution &&
    monthlyContribution > 0 &&
    Number(targetAmount) > Number(currentAmount ?? 0)
  ) {
    const remaining = Number(targetAmount) - Number(currentAmount ?? 0);
    const monthsBetween = Math.max(
      1,
      Math.ceil(
        (new Date(targetDate).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24 * 30),
      ),
    );
    if (monthsBetween * Number(monthlyContribution) < remaining) {
      pacingWarning = t.goals.contributionTooSlow;
    }
  }

  async function onSubmit(values: SavingsGoalInput) {
    setSubmitting(true);
    const cleaned = {
      ...values,
      targetDate: values.targetDate || null,
      monthlyContribution: values.monthlyContribution || null,
    };
    const result = isEdit
      ? await updateGoal(initial!.id!, cleaned)
      : await createGoal(cleaned);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isEdit ? t.goals.goalUpdated : t.goals.goalAdded);
    onSuccess?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="goal-name">{t.goals.name}</Label>
        <Input
          id="goal-name"
          placeholder={t.goals.namePlaceholder}
          {...register('name')}
        />
        {errors.name && (
          <p className="text-xs text-rose-600">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="goal-target">{t.goals.targetAmount}</Label>
          <Input
            id="goal-target"
            type="number"
            step="0.01"
            dir="ltr"
            className="text-start"
            {...register('targetAmount')}
          />
          {errors.targetAmount && (
            <p className="text-xs text-rose-600">
              {errors.targetAmount.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-current">{t.goals.currentAmount}</Label>
          <Input
            id="goal-current"
            type="number"
            step="0.01"
            dir="ltr"
            className="text-start"
            {...register('currentAmount')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="goal-date">{t.goals.targetDate}</Label>
          <Input id="goal-date" type="date" {...register('targetDate')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-monthly">{t.goals.monthlyContribution}</Label>
          <Input
            id="goal-monthly"
            type="number"
            step="0.01"
            dir="ltr"
            className="text-start"
            {...register('monthlyContribution', {
              onChange: () => setMonthlyEdited(true),
            })}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {monthlyEdited
          ? t.goals.monthlyContributionHint
          : t.goals.monthlyContributionAuto}
      </p>

      {pacingWarning && (
        <p className="text-xs text-amber-700">{pacingWarning}</p>
      )}

      <div className="space-y-2">
        <Label>{t.goals.icon}</Label>
        <div className="flex flex-wrap gap-2">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setValue('icon', i, { shouldValidate: true })}
              className={cn(
                'size-10 rounded-lg text-xl flex items-center justify-center ring-1 ring-slate-200 hover:ring-violet-400',
                icon === i && 'ring-2 ring-violet-500 bg-violet-50',
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t.goals.color}</Label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setValue('color', c, { shouldValidate: true })}
              className={cn(
                'size-8 rounded-full ring-2 ring-offset-2 ring-offset-white',
                color === c ? 'ring-slate-900' : 'ring-transparent',
              )}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-violet-600 text-white hover:bg-violet-700"
      >
        {submitting ? t.common.saving : t.goals.saveGoal}
      </Button>
    </form>
  );
}
