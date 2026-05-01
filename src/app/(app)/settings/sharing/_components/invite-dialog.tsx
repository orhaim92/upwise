'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Copy, Check } from 'lucide-react';
import { createInvitation } from '../actions';
import { toast } from 'sonner';
import { t } from '@/lib/i18n/he';

type Generated = { link: string; emailSent: boolean };

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail('');
    setGenerated(null);
    setCopied(false);
  }

  async function handleGenerate() {
    setSubmitting(true);
    const r = await createInvitation({ email: email.trim() });
    setSubmitting(false);
    if (!r.ok || !r.link) {
      toast.error(r.error);
      return;
    }
    setGenerated({
      link: r.link,
      emailSent: r.emailSent ?? false,
    });
  }

  async function handleCopy() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.link);
    setCopied(true);
    toast.success(t.sharing.linkCopied);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        <UserPlus className="size-4" />
        {t.sharing.inviteButton}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sharing.inviteDialogTitle}</DialogTitle>
            <DialogDescription>
              {t.sharing.inviteDialogDescription}
            </DialogDescription>
          </DialogHeader>

          {!generated ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t.sharing.inviteEmail}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="partner@example.com"
                  dir="ltr"
                  className="text-start"
                />
                <p className="text-xs text-slate-500">
                  {t.sharing.inviteEmailHint}
                </p>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={!email.trim() || submitting}
                className="bg-violet-600 text-white hover:bg-violet-700 w-full"
              >
                {t.sharing.generateInvite}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {generated.emailSent ? (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  {t.sharing.emailSent}
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  {t.sharing.emailNotConfigured}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t.sharing.inviteLinkTitle}</Label>
                <p className="text-xs text-slate-500">
                  {t.sharing.inviteLinkBody}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={generated.link}
                    readOnly
                    dir="ltr"
                    className="font-mono text-xs text-start"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button onClick={handleCopy} variant="outline" size="icon">
                    {copied ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => setOpen(false)}
                variant="outline"
                className="w-full"
              >
                {t.common.close}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
