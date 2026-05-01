'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptInvitation } from './actions';
import { t } from '@/lib/i18n/he';

export function AcceptForm({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleAccept() {
    setSubmitting(true);
    const r = await acceptInvitation(token);
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(t.sharing.acceptInviteAccepted);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Button
      onClick={handleAccept}
      disabled={submitting}
      className="bg-violet-600 text-white hover:bg-violet-700 w-full"
    >
      {t.sharing.acceptButton}
    </Button>
  );
}
