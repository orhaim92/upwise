'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateCycle } from '../actions';
import { t } from '@/lib/i18n/he';

export function CycleSettingsForm({ initialDay }: { initialDay: number }) {
  const router = useRouter();
  const [day, setDay] = useState(initialDay);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await updateCycle({ billingCycleStartDay: day });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? t.common.error);
      return;
    }
    toast.success(t.cycleSettings.saved);
    router.refresh();
  }

  return (
    <div className="flex items-end gap-3">
      <div className="space-y-2 flex-1 max-w-xs">
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
