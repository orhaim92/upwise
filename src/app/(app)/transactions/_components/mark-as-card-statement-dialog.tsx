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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { listCardsForHousehold } from '../../accounts/actions';
import { markAsCardStatement } from '../actions';
import { t } from '@/lib/i18n/he';

type Card = {
  accountId: string;
  accountDisplayName: string;
  cardLastFour: string;
};

type Props = {
  transactionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MarkAsCardStatementDialog({
  transactionId,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  // Selected key encodes both accountId and cardLastFour: "{accountId}|{last4}"
  const [selectedKey, setSelectedKey] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && cards.length === 0) {
      listCardsForHousehold().then(setCards);
    }
  }, [open, cards.length]);

  async function handleSave() {
    if (!selectedKey) return;
    const [accountId, cardLastFour] = selectedKey.split('|');
    if (!accountId || !cardLastFour) return;

    setSubmitting(true);
    const r = await markAsCardStatement({
      transactionId,
      cardAccountId: accountId,
      cardLastFour,
    });
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(t.transactions.cardStatementMarked);
    onOpenChange(false);
    setSelectedKey('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.transactions.markAsCardStatement}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {cards.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              {t.accounts.noBankAccountsAvailable}
            </p>
          ) : (
            <Select
              value={selectedKey}
              onValueChange={(v) => setSelectedKey(v ?? '')}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t.transactions.selectCardForStatement}
                />
              </SelectTrigger>
              <SelectContent>
                {cards.map((c) => {
                  const key = `${c.accountId}|${c.cardLastFour}`;
                  return (
                    <SelectItem key={key} value={key}>
                      {c.accountDisplayName} •••• {c.cardLastFour}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleSave}
            disabled={!selectedKey || submitting}
            className="bg-violet-600 text-white hover:bg-violet-700 w-full"
          >
            {submitting ? t.common.saving : t.common.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
