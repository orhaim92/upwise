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
import { RuleForm } from './rule-form';
import { t } from '@/lib/i18n/he';

type Category = {
  id: string;
  key: string;
  icon: string | null;
};

export function AddRuleDialog({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        <Plus className="size-4" />
        {t.recurring.addRule}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.recurring.addRuleTitle}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pe-1">
            <RuleForm
              categories={categories}
              onSuccess={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
