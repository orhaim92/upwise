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
