'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n/he';
import { addManualItem } from '../manual-actions';

type Props = { type: 'income' | 'expense' };

export function AddManualItemDialog({ type }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setAmount('');
    setNote('');
  }

  async function handleSubmit() {
    setSubmitting(true);
    const r = await addManualItem({
      type,
      name: name.trim(),
      amount: parseFloat(amount),
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(t.allowance.manualItemAdded);
    setOpen(false);
    reset();
  }

  const title =
    type === 'income'
      ? t.allowance.addOneTimeIncome
      : t.allowance.addOneTimeExpense;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
      >
        <Plus className="size-3" />
        {t.allowance.addOneTime}
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="manual-name">{t.allowance.manualItemName}</Label>
              <Input
                id="manual-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-amount">
                {t.allowance.manualItemAmount}
              </Label>
              <Input
                id="manual-amount"
                type="number"
                inputMode="decimal"
                dir="ltr"
                className="text-start"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-note">{t.allowance.manualItemNote}</Label>
              <Input
                id="manual-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !amount || submitting}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {submitting ? t.common.saving : t.common.save}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
