'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { t } from '@/lib/i18n/he';

// Sticks to the bottom of the viewport whenever navigator.onLine flips to
// false. Static link to /dashboard works fine offline because the SW caches
// it via stale-while-revalidate.
export function OfflineBanner() {
  // Default true so we don't briefly flash "offline" during hydration.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-center gap-2 text-amber-900 text-sm">
      <WifiOff className="size-4" />
      <span>{t.offline.banner}</span>
    </div>
  );
}
