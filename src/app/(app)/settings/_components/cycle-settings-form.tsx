'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateCycle } from '../actions';
import { t } from '@/lib/i18n/he';

type Props = {
  initialDay: number;
  initialAutoDetect: boolean;
};

export function CycleSettingsForm({ initialDay, initialAutoDetect }: Props) {
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [autoDetect, setAutoDetect] = useState(initialAutoDetect);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await updateCycle({
      billingCycleStartDay: day,
      autoDetectCycleStart: autoDetect,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? t.common.error);
      return;
    }
    toast.success(t.cycleSettings.saved);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-w-xs">
        <Label htmlFor="cycle-day">{t.cycleSettings.startDay}</Label>
        <Input
          id="cycle-day"
          type="number"
          min={1}
          max={28}
          value={day}
          onChange={(e) => setDay(parseInt(e.target.value, 10) || 1)}
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoDetect}
          onChange={(e) => setAutoDetect(e.target.checked)}
          className="mt-0.5 size-4 accent-violet-600"
        />
        <span>
          <span className="block font-medium">
            {t.cycleSettings.autoDetectLabel}
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            {t.cycleSettings.autoDetectHint}
          </span>
        </span>
      </label>

      <Button
        onClick={handleSubmit}
        disabled={submitting || day < 1 || day > 28}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        {submitting ? t.common.saving : t.common.save}
      </Button>
    </div>
  );
}
