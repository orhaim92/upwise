'use client';

import { useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInDays, format } from 'date-fns';
import { cancelInvitation } from '../actions';
import { t } from '@/lib/i18n/he';

type Invitation = {
  id: string;
  invitedEmail: string;
  role: 'admin' | 'member';
  expiresAt: Date;
  createdAt: Date;
};

type Props = {
  invitations: Invitation[];
};

export function InvitationsList({ invitations }: Props) {
  const [pending, startTransition] = useTransition();

  if (invitations.length === 0) {
    return (
      <Card className="p-5 text-center text-sm text-slate-500">
        {t.sharing.noPendingInvitations}
      </Card>
    );
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const r = await cancelInvitation(id);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.sharing.inviteCancelled);
    });
  }

  const now = new Date();

  return (
    <ul className="space-y-2">
      {invitations.map((inv) => {
        const daysPending = differenceInDays(now, new Date(inv.createdAt));
        const expiryStr = format(new Date(inv.expiresAt), 'dd.MM.yyyy');
        return (
          <li key={inv.id}>
            <Card className="p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" dir="ltr">
                  {inv.invitedEmail}
                </p>
                <div className="flex gap-3 text-xs text-slate-500 mt-1">
                  <span>
                    {t.sharing.pendingForDays.replace(
                      '{n}',
                      daysPending.toString(),
                    )}
                  </span>
                  <span>
                    {t.sharing.expiresOn.replace('{date}', expiryStr)}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCancel(inv.id)}
                disabled={pending}
                aria-label={t.sharing.cancelInvite}
              >
                <X className="size-4 text-rose-600" />
              </Button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
