'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/he';

// Chrome / Edge / Android Chrome dispatch `beforeinstallprompt` when the
// PWA install criteria are met. We capture it, wait for the user to opt in,
// then trigger the native prompt. If they dismiss, suppress the prompt for
// SUPPRESS_DAYS so we don't nag.
//
// iOS Safari does NOT fire this event — install is manual via Share menu.
// The push settings page handles iOS install instructions.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'upwise.installPrompt.dismissedAt';
const SUPPRESS_DAYS = 14;

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(DISMISS_KEY);
      if (v) {
        const dismissedAt = parseInt(v, 10);
        if (
          Date.now() - dismissedAt <
          SUPPRESS_DAYS * 24 * 60 * 60 * 1000
        ) {
          return;
        }
      }
    } catch {
      // localStorage may be blocked (private mode etc.) — fall through.
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      setShow(false);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // ignore
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-40 bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 flex items-start gap-3">
      <div className="size-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
        <Download className="size-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{t.push.installPromptTitle}</p>
        <p className="text-xs text-slate-600 mt-0.5">
          {t.push.installPromptBody}
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            onClick={install}
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {t.push.installPromptCta}
          </Button>
          <Button onClick={dismiss} size="sm" variant="ghost">
            {t.push.installPromptDismiss}
          </Button>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="p-1 text-slate-400 hover:text-slate-600"
        aria-label="סגור"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
