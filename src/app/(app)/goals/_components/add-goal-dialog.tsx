'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GoalForm } from './goal-form';
import { t } from '@/lib/i18n/he';

export function AddGoalDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        <Plus className="size-4" />
        {t.goals.addGoal}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.goals.addGoalTitle}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pe-1">
            <GoalForm onSuccess={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
