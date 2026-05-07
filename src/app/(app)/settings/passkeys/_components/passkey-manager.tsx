'use client';

import { useState, useTransition } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'sonner';
import { Fingerprint, Trash2, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  type PasskeySummary,
} from '../actions';
import { t } from '@/lib/i18n/he';

type Props = {
  initialPasskeys: PasskeySummary[];
};

// Settings UI for managing the signed-in user's passkeys.
//
// "Add passkey" runs the WebAuthn registration ceremony in the browser
// (Touch/Face ID on mobile, Windows Hello on desktop, hardware key, etc.).
// We skip the dance entirely on devices the platform reports as unable to
// host platform authenticators — there's no value in offering an unusable
// button.
export function PasskeyManager({ initialPasskeys }: Props) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleAdd() {
    setAdding(true);
    try {
      const optsResult = await getPasskeyRegistrationOptions();
      if (!optsResult.ok) {
        toast.error(t.passkeys.errorGeneric);
        return;
      }
      // Browser prompts user (Touch/Face ID, OS biometric, etc.)
      const attResp = await startRegistration(optsResult.options);
      const label = guessLabel();
      const verify = await verifyPasskeyRegistration({
        response: attResp,
        label,
      });
      if (!verify.ok) {
        toast.error(t.passkeys.errorGeneric);
        return;
      }
      toast.success(t.passkeys.added);
      // Optimistic refresh — re-fetch list via a tiny round-trip rather than
      // patch local state (the server-rendered initial list lacks the new id).
      const { listMyPasskeys } = await import('../actions');
      setPasskeys(await listMyPasskeys());
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // User cancelled the OS biometric sheet — not an error worth alerting.
      if (
        msg.includes('cancel') ||
        msg.includes('NotAllowedError') ||
        msg.includes('AbortError')
      ) {
        return;
      }
      toast.error(t.passkeys.errorGeneric);
    } finally {
      setAdding(false);
    }
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await deletePasskey({ id });
      if (!r.ok) {
        toast.error(t.passkeys.errorGeneric);
        return;
      }
      setPasskeys((p) => p.filter((x) => x.id !== id));
      toast.success(t.passkeys.removed);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <Fingerprint className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t.passkeys.addTitle}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {t.passkeys.addSubtitle}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="w-full bg-violet-600 text-white hover:bg-violet-700"
        >
          {adding && <Loader2 className="size-4 animate-spin" />}
          {adding ? t.passkeys.adding : t.passkeys.addButton}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">{t.passkeys.listTitle}</h2>
        {passkeys.length === 0 ? (
          <p className="text-sm text-slate-500">{t.passkeys.empty}</p>
        ) : (
          <ul className="space-y-2">
            {passkeys.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
              >
                <Fingerprint className="size-5 text-violet-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {p.label ?? t.passkeys.unnamedDevice}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.passkeys.registeredOn}{' '}
                    {new Date(p.createdAt).toLocaleDateString('he-IL')}
                    {p.lastUsedAt && (
                      <>
                        {' · '}
                        {t.passkeys.lastUsed}{' '}
                        {new Date(p.lastUsedAt).toLocaleDateString('he-IL')}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  disabled={pending}
                  aria-label={t.passkeys.removeAria}
                  className="size-8 inline-flex items-center justify-center rounded text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Friendly default name for a freshly-enrolled credential, e.g.
// "iPhone · 7.5.2026". The user can rename later via a future edit flow.
function guessLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent;
  let device = 'Device';
  if (/iPhone/i.test(ua)) device = 'iPhone';
  else if (/iPad/i.test(ua)) device = 'iPad';
  else if (/Android/i.test(ua)) device = 'Android';
  else if (/Mac/i.test(ua)) device = 'Mac';
  else if (/Windows/i.test(ua)) device = 'Windows';
  return `${device} · ${new Date().toLocaleDateString('he-IL')}`;
}
