'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/he';

// Show the popup once the session has this much time (or less) remaining.
const WARN_THRESHOLD_MS = 2 * 60 * 1000;
// Re-check session.expires this often.
const POLL_INTERVAL_MS = 15 * 1000;

// Watches the JWT session and prompts the user to extend it shortly before
// expiry. Mounted once inside the (app) layout so it only runs for
// authenticated routes.
//
// On expiry without action: signs the user out (Auth.js would do this on
// the next request anyway; we trigger it explicitly so the redirect is
// immediate, not deferred to the next click).
export function SessionTimeoutWatcher() {
  const { data: session, update, status } = useSession();
  const [open, setOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredRef = useRef(false);
  // Did we ever observe an authenticated session? If so, a transition to
  // 'unauthenticated' means the session expired (or was revoked elsewhere)
  // — kick the user to /login so they can't keep interacting with a stale
  // SSR'd page.
  const everAuthedRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated') {
      everAuthedRef.current = true;
      return;
    }
    if (status === 'unauthenticated' && everAuthedRef.current) {
      signOut({ callbackUrl: '/login', redirect: true });
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.expires) return;

    function tick() {
      const expires = session?.expires
        ? new Date(session.expires).getTime()
        : null;
      if (expires === null) return;
      const remaining = expires - Date.now();
      setRemainingMs(remaining);

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        // Hard signOut on natural expiry — sends the user back to /login.
        signOut({ callbackUrl: '/login', redirect: true });
        return;
      }
      if (remaining <= WARN_THRESHOLD_MS) setOpen(true);
    }

    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [session?.expires, status]);

  async function handleStay() {
    setExtending(true);
    // update() re-runs the jwt callback; Auth.js mints a new token whose
    // exp = iat + maxAge, so we get a fresh 30-minute window.
    await update();
    expiredRef.current = false;
    setOpen(false);
    setExtending(false);
  }

  function handleSignOut() {
    signOut({ callbackUrl: '/login', redirect: true });
  }

  if (status !== 'authenticated' || !open) return null;

  // Format remaining time as M:SS (clamped to 0).
  const remaining = Math.max(0, remainingMs ?? 0);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const timeLabel = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-600" />
            <DialogTitle>{t.session.expiringTitle}</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          {t.session.expiringBody}
        </p>
        <p
          className="text-2xl font-bold tabular-nums text-center text-amber-700"
          dir="ltr"
        >
          {timeLabel}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={extending}
          >
            {t.session.signOutNow}
          </Button>
          <Button
            type="button"
            onClick={handleStay}
            disabled={extending}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {extending && <Loader2 className="size-4 animate-spin" />}
            {extending ? t.common.loading : t.session.stayLoggedIn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
