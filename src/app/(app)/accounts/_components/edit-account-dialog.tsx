'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateAccount } from '../actions';
import { t } from '@/lib/i18n/he';

type Props = {
  account: { id: string; displayName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditAccountDialog({ account, open, onOpenChange }: Props) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await updateAccount({
      id: account.id,
      displayName,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t.accounts.updateSuccess);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.accounts.editTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">
              {t.accounts.displayName}
            </Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">{t.accounts.editNote}</p>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !displayName.trim()}
            className="bg-violet-600 text-white hover:bg-violet-700 w-full"
          >
            {submitting ? t.accounts.saving : t.accounts.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
