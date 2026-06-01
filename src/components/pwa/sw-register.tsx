'use client';

import { useEffect } from 'react';

// Registers /sw.js as a service worker scoped to the whole origin. Idempotent
// — the browser de-dups by URL+scope, so repeat registrations on hot reload
// are a no-op.
//
// Mount once, near the bottom of the root layout's <body>. We register on
// `load` (not on mount) so the SW install can't compete with the initial
// page paint.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Never register in development. A SW that caches JS chunks while you're
    // editing serves stale code behind every server restart (the source is
    // correct, but the browser runs old chunks). In dev we always want the
    // network so chunks are fresh.
    if (process.env.NODE_ENV !== 'production') {
      // Proactively tear down any SW left registered from a prior prod build
      // or earlier dev session, so it stops intercepting chunk requests.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.error('SW registration failed:', err));
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  return null;
}
