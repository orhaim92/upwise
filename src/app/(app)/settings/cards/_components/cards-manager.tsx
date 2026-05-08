'use client';

import { useState, useTransition } from 'react';
import { CreditCard, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { setCardImmediate, type CardSummary } from '../actions';
import { t } from '@/lib/i18n/he';

type Props = {
  initialCards: CardSummary[];
};

export function CardsManager({ initialCards }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [pending, startTransition] = useTransition();

  function handleToggle(cardLastFour: string, next: boolean) {
    // Optimistic — flip locally so the checkbox is responsive; revert on error.
    setCards((prev) =>
      prev.map((c) =>
        c.cardLastFour === cardLastFour ? { ...c, isImmediate: next } : c,
      ),
    );
    startTransition(async () => {
      const r = await setCardImmediate({ cardLastFour, isImmediate: next });
      if (!r.ok) {
        toast.error(t.cards.errorGeneric);
        setCards((prev) =>
          prev.map((c) =>
            c.cardLastFour === cardLastFour
              ? { ...c, isImmediate: !next }
              : c,
          ),
        );
        return;
      }
      toast.success(next ? t.cards.markedImmediate : t.cards.markedRegular);
    });
  }

  if (cards.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        {t.cards.empty}
      </Card>
    );
  }

  return (
    <Card className="p-2 divide-y divide-slate-100">
      {cards.map((c) => (
        <label
          key={c.cardLastFour}
          className="flex items-center gap-3 p-3 cursor-pointer select-none hover:bg-slate-50 rounded"
        >
          <input
            type="checkbox"
            checked={c.isImmediate}
            disabled={pending}
            onChange={(e) => handleToggle(c.cardLastFour, e.target.checked)}
            className="size-4 accent-violet-600"
          />
          <div className="size-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            {c.isImmediate ? (
              <Zap className="size-4 text-violet-600" />
            ) : (
              <CreditCard className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              <span dir="ltr" className="font-mono">
                {c.cardLastFour}
              </span>
              {' · '}
              <span className="text-slate-600">{c.accountName}</span>
            </p>
            <p className="text-xs text-slate-500">
              {c.txCount} {t.cards.txCount}
              {c.isImmediate && (
                <>
                  {' · '}
                  <span className="text-violet-600 font-medium">
                    {t.cards.immediateBadge}
                  </span>
                </>
              )}
            </p>
          </div>
        </label>
      ))}
    </Card>
  );
}
